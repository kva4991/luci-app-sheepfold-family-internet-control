'use strict';
'require baseclass';
'require ui';

/* §frontmod §overviewcut1
 * The quick-allowlist controller owns one modal session: its 30-second window,
 * candidate polling, QR presentation and per-candidate add actions. It receives
 * inventory and persistence through callbacks and never reads UCI directly.
 */
function create(deps) {
	function currentDevices() {
		return (deps.devices && deps.devices()) || [];
	}

	function candidateKey(device) {
		var normalized = deps.normalizeMac && deps.normalizeMac(device && device.mac);
		return normalized || '';
	}

	function ageText(ageMs) {
		var seconds = Math.max(0, Math.floor(Number(ageMs || 0) / 1000));
		var minutes;

		if (seconds < 60)
			return seconds + ' ' + _('seconds ago');
		minutes = Math.floor(seconds / 60);
		if (minutes === 1)
			return _('minute ago');
		return minutes + ' ' + _('minutes ago');
	}

	function candidateRow(candidate, onAdd) {
		return E('tr', {}, [
			E('td', {}, [
				E('strong', {}, [
					deps.identityIcon ? deps.identityIcon(candidate.device) : '',
					E('span', {}, candidate.device.name || '-')
				]),
				E('small', {}, _('Connected after quick add started.'))
			]),
			E('td', {}, candidate.device.ip || '-'),
			E('td', {}, candidate.device.mac || '-'),
			E('td', {}, ageText(Date.now() - candidate.firstSeenAt)),
			E('td', {}, E('button', {
				'class': 'sf-action sf-action-positive',
				'disabled': candidate.added ? 'disabled' : null,
				'click': function (event) {
					event.preventDefault();
					onAdd(candidate, event.currentTarget);
				}
			}, candidate.added ? _('Device added to allowlist.') : _('Add')))
		]);
	}

	function candidateTable(candidates, onAdd) {
		return E('table', { 'class': 'sf-quick-table' }, [
			E('thead', {}, E('tr', {}, [
				E('th', {}, _('Device')),
				E('th', {}, 'IP'),
				E('th', {}, 'MAC'),
				E('th', {}, _('Seen')),
				E('th', {}, _('Actions'))
			])),
			E('tbody', {}, candidates.map(function (candidate) {
				return candidateRow(candidate, onAdd);
			}))
		]);
	}

	function show() {
		var networks = deps.readNetworks();
		var wifiPayload = networks.length ?
			deps.wifiPayload(networks[0].ssid, networks[0].password, networks[0].encryption) :
			'WIFI:T:nopass;S:;;';
		var allowlistToken = deps.token(18);
		var allowlistUrl = deps.allowlistUrl(allowlistToken);
		var progressFill = E('span', { 'class': 'sf-quick-progress-fill' });
		var permitButton;
		var timer = null;
		var refreshTimer = null;
		var startSequence = 0;
		var secondsTotal = 30;
		var windowStartedAt = 0;
		var windowExpiresAt = 0;
		var baselineKeys = {};
		var candidateMap = {};
		var candidatesNode = E('div', { 'class': 'sf-quick-candidates' });
		var permitTitle;
		var permitHint;

		currentDevices().forEach(function (device) {
			baselineKeys[candidateKey(device)] = true;
		});

		function stopTimers() {
			if (timer)
				window.clearInterval(timer);
			if (refreshTimer)
				window.clearInterval(refreshTimer);
			timer = null;
			refreshTimer = null;
		}

		function candidateList() {
			return Object.keys(candidateMap).map(function (key) {
				return candidateMap[key];
			}).sort(function (left, right) {
				return right.firstSeenAt - left.firstSeenAt;
			});
		}

		function renderCandidates() {
			candidatesNode.replaceChildren(candidateTable(candidateList(), function (candidate, button) {
				deps.execute({
					key: 'quick-allowlist:' + deps.normalizeMac(candidate.device.mac),
					button: button,
					task: function () { return deps.persist(candidate.device); },
					successMessage: _('Device added to allowlist.'),
					errorMessage: _('Could not add device.'),
					onSuccess: function () {
						candidate.added = true;
						renderCandidates();
					}
				}).catch(function () { return null; });
			}));
		}

		function refreshCandidates() {
			if (!windowStartedAt || Date.now() > windowExpiresAt)
				return Promise.resolve();

			return deps.readDevices().then(function (devices) {
				(devices || []).forEach(function (device) {
					var key = candidateKey(device);
					if (!key || baselineKeys[key] || candidateMap[key] ||
						device.status === 'blocked' || device.status === 'allow')
						return;
					candidateMap[key] = { device: device, firstSeenAt: Date.now() };
				});
				renderCandidates();
			});
		}

		function startWindow() {
			var remaining = secondsTotal;
			var sequence = ++startSequence;

			stopTimers();
			permitButton.classList.remove('expired');
			permitTitle.textContent = _('Adding allowed');
			permitHint.textContent = _('Click to restart the 30 second window.');
			windowStartedAt = Date.now();
			windowExpiresAt = windowStartedAt + secondsTotal * 1000;
			baselineKeys = {};
			renderCandidates();

			Promise.resolve().then(function () { return deps.readDevices(); }).then(function (devices) {
				if (sequence !== startSequence)
					return;
				(devices || []).forEach(function (device) {
					baselineKeys[candidateKey(device)] = true;
				});
				refreshCandidates();
				refreshTimer = window.setInterval(function () { refreshCandidates().catch(function () { return null; }); }, 3000);
			}).catch(function () { return null; });

			function tick() {
				progressFill.style.width = Math.max(0, remaining / secondsTotal * 100) + '%';
				if (remaining <= 0) {
					stopTimers();
					permitButton.classList.add('expired');
					permitTitle.textContent = _('Adding window expired');
					permitHint.textContent = _('Click to restart the 30 second window.');
				}
				remaining--;
			}

			tick();
			timer = window.setInterval(tick, 1000);
		}

		permitTitle = E('strong', {}, _('Adding allowed'));
		permitHint = E('small', {}, _('Click to restart the 30 second window.'));
		permitButton = E('button', {
			'class': 'sf-action sf-action-positive sf-quick-permit',
			'click': function (event) {
				event.preventDefault();
				startWindow();
			}
		}, [progressFill, permitTitle, permitHint]);

		ui.showModal(_('Quick allowlist add'), [
			E('div', { 'class': 'sf-modal-quick' }, [
				E('div', { 'class': 'sf-modal-quick-top' }, [
					E('div', { 'class': 'sf-qr-wrap' }, [
						E('h4', {}, _('Wi-Fi access QR')),
						deps.qrCode(wifiPayload),
						E('p', {}, _('Scan Wi-Fi QR, then add newly connected devices manually.'))
					]),
					E('div', { 'class': 'sf-qr-wrap sf-qr-divider' }, [
						E('h4', {}, _('Allowlist request QR')),
						deps.qrCode(allowlistUrl),
						E('p', {}, _('After connecting to Wi-Fi, scan this QR to request allowlist access from this phone.')),
						deps.settingLine(_('One-time allowlist link'), allowlistUrl)
					]),
					E('div', { 'class': 'sf-quick-side' }, [
						permitButton,
						E('div', { 'class': 'sf-note' }, _('Quick mode only collects candidates. A parent still presses Add for every device.'))
					])
				]),
				E('div', { 'class': 'sf-quick-candidates-wrap' }, [
					E('h4', {}, _('Newly connected devices')),
					candidatesNode
				])
			]),
			E('div', { 'class': 'right' }, [
				E('button', {
					'class': 'btn cbi-button',
					'click': function () {
						stopTimers();
						ui.hideModal();
					}
				}, _('Close'))
			])
		]);
		startWindow();
	}

	function button() {
		return E('button', {
			'class': 'sf-action sf-action-positive',
			'click': function (event) {
				event.preventDefault();
				show();
			}
		}, _('Quick add to allowlist'));
	}

	return {
		button: button,
		show: show,
		candidateKey: candidateKey,
		ageText: ageText
	};
}

return baseclass.extend({ create: create });
