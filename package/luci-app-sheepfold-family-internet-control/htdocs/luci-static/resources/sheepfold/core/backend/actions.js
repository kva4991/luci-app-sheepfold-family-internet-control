'use strict';
'require baseclass';

/* §apicon1 §frontmod
 * Одна мутация LuCI владеет одним выполняющимся Promise, всеми связанными
 * элементами управления, разбором структурированного результата, одним сообщением
 * и одним локальным обновлением. Предметная UCI/runtime-логика передаётся callback-ом.
 */
function create(deps) {
	var inFlight = Object.create(null);

	function asError(value, fallback) {
		var error;
		if (value && typeof value === 'object')
			return value;
		error = new Error(String(value == null ? fallback || 'Action failed.' : value));
		error.cause = value;
		if (typeof value === 'number') {
			error.exitCode = value;
			error.status = 'error';
		}
		return error;
	}

	function parseKeyValues(text) {
		if (deps.parseKeyValues)
			return deps.parseKeyValues(text);

		var values = {};
		String(text || '').split(/\r?\n/).forEach(function (line) {
			var separator = line.indexOf('=');
			if (separator > 0)
				values[line.slice(0, separator)] = line.slice(separator + 1);
		});
		return values;
	}

	function stableKey(spec) {
		var args = spec.args || [];
		var key = String(spec.key || args.join('\u001f') || '');

		if (!key)
			throw new Error(spec.task ?
				'Composite LuCI actions require a stable key.' :
				'LuCI actions require command arguments or a stable key.');
		return key;
	}

	function buttonList(spec, key) {
		var controls = [];

		function add(node) {
			if (!node || !node.setAttribute || controls.indexOf(node) !== -1)
				return;
			node.setAttribute('data-sf-action-key', key);
			controls.push(node);
		}

		add(spec.button);
		Array.prototype.slice.call(spec.buttons || []).forEach(add);
		if (typeof document !== 'undefined' && document.querySelectorAll) {
			document.querySelectorAll('[data-sf-action-key]').forEach(function (node) {
				if (node.getAttribute('data-sf-action-key') === key)
					add(node);
			});
		}
		return controls;
	}

	function lockControls(entry, controls, busyText) {
		controls.forEach(function (node) {
			if (entry.states.some(function (state) { return state.node === node; }))
				return;

			entry.states.push({
				node: node,
				disabled: !!node.disabled,
				ariaBusy: node.getAttribute('aria-busy'),
				textContent: node.textContent,
				children: Array.prototype.slice.call(node.childNodes || [])
			});
			node.disabled = true;
			node.setAttribute('aria-busy', 'true');
			if (node.classList)
				node.classList.add('sf-command-busy');
			if (busyText)
				node.textContent = String(busyText);
		});
	}

	function unlockControls(entry) {
		entry.states.forEach(function (state) {
			state.node.disabled = state.disabled;
			if (state.children && state.node.replaceChildren)
				state.node.replaceChildren.apply(state.node, state.children);
			else
				state.node.textContent = state.textContent;
			if (state.node.classList)
				state.node.classList.remove('sf-command-busy');
			if (state.ariaBusy == null)
				state.node.removeAttribute('aria-busy');
			else
				state.node.setAttribute('aria-busy', state.ariaBusy);
		});
	}

	function nestedError(root) {
		if (!root || typeof root !== 'object')
			return null;
		if (root.error && typeof root.error === 'object')
			return root.error;
		return null;
	}

	function failureStatus(value) {
		return /^(?:error|failed|failure|denied|invalid)$/i.test(String(value || ''));
	}

	function inspect(result, parseMode) {
		if (result && result.sheepfold && result.result !== undefined)
			return result;

		var code = Number(result && result.code || 0);
		var stdout = String(result && result.stdout || '');
		var stderr = String(result && result.stderr || '');
		var trimmed = stdout.trim();
		var metadata = deps.actionMetadata ? deps.actionMetadata(result) : {};
		var data = trimmed;
		var status = metadata.status || (code === 0 ? 'ok' : 'error');
		var errorCode = metadata.errorCode || '';
		var message = metadata.message || '';
		var ok = code === 0 && !failureStatus(status);
		var parsed;
		var nested;
		var shouldParseJson = parseMode === 'json' ||
			(!parseMode && (trimmed.charAt(0) === '[' || trimmed.charAt(0) === '{'));
		var shouldParseKv = parseMode === 'kv' || (!parseMode && /(?:^|\n)(?:status|ok|errorCode|error_code|message)=/.test(trimmed));

		if (shouldParseJson && trimmed) {
			try {
				parsed = JSON.parse(trimmed);
				data = parsed && Object.prototype.hasOwnProperty.call(parsed, 'data') ? parsed.data : parsed;
				nested = nestedError(parsed);
				if (parsed && parsed.ok === false)
					ok = false;
				if (parsed && parsed.status)
					status = String(parsed.status);
				if (failureStatus(status))
					ok = false;
				errorCode = String(
					(parsed && (parsed.errorCode || parsed.error_code)) ||
					(nested && nested.code) || errorCode || ''
				);
				message = String(
					(parsed && parsed.message) ||
					(nested && nested.message) || message || ''
				);
			} catch (error) {
				if (parseMode === 'json') {
					ok = false;
					status = 'error';
					errorCode = 'invalid_response';
					message = error.message;
				}
			}
		} else if (shouldParseKv) {
			data = parseKeyValues(stdout);
			if (data.status)
				status = String(data.status);
			if (data.ok === 'false' || failureStatus(status))
				ok = false;
			errorCode = String(data.errorCode || data.error_code || errorCode || '');
			message = String(data.message || message || '');
		}

		if (metadata.status === 'error')
			ok = false;
		if (!ok && !errorCode)
			errorCode = code === 124 ? 'action_timeout' : 'action_failed';
		if (!message && !ok) {
			message = deps.errorText ? deps.errorText(result, '') : '';
			message = message || stderr.trim() || stdout.trim();
		}

		var sheepfold = {
			ok: ok,
			code: code,
			status: status,
			errorCode: errorCode,
			message: message,
			data: data
		};
		return {
			ok: ok,
			code: code,
			status: status,
			errorCode: errorCode,
			message: message,
			data: data,
			result: result,
			stdout: stdout,
			stderr: stderr,
			sheepfold: sheepfold
		};
	}

	function actionError(response, fallback) {
		var details = response.message || '';
		var message = details || fallback || 'Action failed.';
		var error = new Error(message);

		error.errorCode = response.errorCode || 'action_failed';
		error.status = response.status || 'error';
		error.exitCode = response.code;
		error.result = response.result;
		error.response = response;
		error.fallback = fallback || '';
		return error;
	}

	function ensureOk(result, fallback, parseMode) {
		var response = inspect(result, parseMode);
		if (!response.ok)
			throw actionError(response, fallback);
		return result;
	}

	function errorText(error, fallback) {
		var details = '';
		if (deps.errorText)
			details = deps.errorText(error, '');
		if (!details && error && error.message)
			details = String(error.message).trim();
		if (!details)
			details = String(fallback || 'Action failed.');
		if (fallback && details !== fallback && details.indexOf(fallback) === -1)
			return String(fallback).trim() + ' ' + details;
		return details;
	}

	function successResponse(value, parseMode) {
		if (value && typeof value === 'object' && (
			Object.prototype.hasOwnProperty.call(value, 'code') ||
			Object.prototype.hasOwnProperty.call(value, 'stdout') ||
			Object.prototype.hasOwnProperty.call(value, 'stderr')
		))
			return inspect(value, parseMode);
		return {
			ok: true,
			code: 0,
			status: 'ok',
			errorCode: '',
			message: '',
			data: value,
			result: value,
			stdout: '',
			stderr: '',
			sheepfold: { ok: true, code: 0, status: 'ok', errorCode: '', message: '', data: value }
		};
	}

	function execute(spec) {
		spec = spec || {};
		var key = stableKey(spec);
		var existing = inFlight[key];
		var entry;

		if (existing) {
			lockControls(existing, buttonList(spec, key), spec.busyText);
			return existing.promise;
		}

		entry = { states: [], promise: null };
		inFlight[key] = entry;
		lockControls(entry, buttonList(spec, key), spec.busyText);

		entry.promise = Promise.resolve().then(function () {
			if (spec.task)
				return spec.task();
			if (spec.timeoutMs && deps.withTimeout)
				return deps.withTimeout(spec.args || [], spec.timeoutMs, spec.timeoutMessage);
			return deps.run(spec.args || []);
		}).then(function (value) {
			var response = successResponse(value, spec.parse);
			var chain = Promise.resolve();

			if (!response.ok)
				throw actionError(response, spec.errorMessage);
			if (spec.onSuccess)
				chain = chain.then(function () { return spec.onSuccess(response); });
			if (spec.refresh && spec.refresh !== spec.onSuccess)
				chain = chain.then(function () { return spec.refresh(response); });

			return chain.then(function () {
				var successMessage = typeof spec.successMessage === 'function' ?
					spec.successMessage(response) : spec.successMessage;
				if (!spec.silent && successMessage && deps.notify)
					deps.notify(successMessage, spec.successLevel || 'info');
				return response;
			});
		}).catch(function (error) {
			var fallback = typeof spec.errorMessage === 'function' ? spec.errorMessage(error) : spec.errorMessage;
			error = asError(error, fallback || 'Action failed.');
			var message = errorText(error, fallback || 'Action failed.');
			var chain = Promise.resolve();

			if (spec.refreshOnError && spec.refresh)
				chain = chain.then(function () {
					return Promise.resolve(spec.refresh()).catch(function (refreshError) {
						error.refreshError = refreshError;
					});
				});
			if (spec.onError)
				chain = chain.then(function () { return spec.onError(error, message); });
			return chain.then(function () {
				if (!spec.silent && spec.notifyError !== false && deps.notify)
					deps.notify(message, spec.errorLevel || 'warning');
				throw error;
			});
		}).finally(function () {
			unlockControls(entry);
			delete inFlight[key];
		});

		return entry.promise;
	}

	function run(args, options) {
		var spec = Object.assign({ args: args || [], silent: true }, options || {});
		return execute(spec).then(function (response) { return response.result; });
	}

	function action(args, options) {
		return execute(Object.assign({ args: args || [] }, options || {}));
	}

	return {
		run: run,
		action: action,
		execute: execute,
		inspect: inspect,
		ensureOk: ensureOk,
		errorText: errorText,
		isBusy: function (key) { return !!inFlight[String(key || '')]; },
		activeKeys: function () { return Object.keys(inFlight); }
	};
}

return baseclass.extend({ create: create });
