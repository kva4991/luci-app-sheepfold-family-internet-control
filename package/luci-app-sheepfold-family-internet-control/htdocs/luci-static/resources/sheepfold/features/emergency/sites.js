'use strict';
'require baseclass';

var sectionType = 'emergency_site';

function normalizeDomain(value) {
	var domain = String(value || '').trim().toLowerCase();
	var labels;

	domain = domain.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
	domain = domain.split(/[/?#]/)[0].replace(/:\d+$/, '');
	domain = domain.replace(/^\.+|\.+$/g, '').replace(/^www\./, '');
	if (!domain || domain.length > 253 || /^\d+(\.\d+){3}$/.test(domain))
		return '';
	labels = domain.split('.');
	if (labels.length < 2 || labels.some(function (label) {
		return !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
	}))
		return '';
	return domain;
}

function normalizeSite(site) {
	var domain = normalizeDomain(site && site[0]);
	var name = String(site && site[1] || '').trim();
	var description = String(site && site[2] || '').trim();
	var section = String(site && site[3] || '').trim();
	var source = String(site && site[4] || '').trim();
	var profileCountry = String(site && site[5] || '').trim();
	var profileId = String(site && site[6] || '').trim();

	if (!domain)
		throw new Error('invalid_domain');
	if (name.length > 120 || description.length > 1000)
		throw new Error('text_too_long');

	// Метаданные принадлежат только встроенному country profile. Любая ручная
	// карточка остаётся самостоятельной и не должна исчезнуть при смене страны.
	if (source !== 'country_profile' || !/^(?:ru|by|cn)$/.test(profileCountry) ||
			!/^[a-z0-9_]{1,40}$/.test(profileId)) {
		source = '';
		profileCountry = '';
		profileId = '';
	}

	return [domain, name, description, section, source, profileCountry, profileId];
}

function clone(sites) {
	return (sites || []).map(function (site) { return site.slice(0, 7); });
}

function fromSections(sections) {
	var orders = Object.create(null);

	(sections || []).forEach(function (section) {
		orders[section['.name']] = parseInt(section.order, 10) || 0;
	});
	return (sections || []).filter(function (section) {
		return section && section['.type'] === sectionType && section.enabled !== '0';
	}).map(function (section) {
		return [
			normalizeDomain(section.domain),
			String(section.name || ''),
			String(section.description || ''),
			String(section['.name'] || ''),
			String(section.source || ''),
			String(section.profile_country || ''),
			String(section.profile_id || '')
		];
	}).filter(function (site) {
		return !!site[0];
	}).sort(function (left, right) {
		return orders[left[3]] - orders[right[3]];
	});
}

function same(left, right) {
	var first = clone(left);
	var second = clone(right);

	return first.length === second.length && first.every(function (site, index) {
		return site.every(function (value, part) { return value === second[index][part]; });
	});
}

function safeSectionName(value) {
	return /^[A-Za-z0-9_-]{1,64}$/.test(value || '') ? value : '';
}

function nextSectionName(domain, used) {
	var base = 'emergency_' + domain.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 44);
	var candidate = base || 'emergency_site';
	var suffix = 2;

	while (used[candidate]) {
		candidate = base.slice(0, 52) + '_' + suffix;
		suffix += 1;
	}
	return candidate;
}

function stage(uci, config, sites) {
	var normalized = (sites || []).map(normalizeSite);
	var used = Object.create(null);
	var domains = Object.create(null);
	var sections = uci.sections(config, sectionType) || [];
	var selectedSections = Object.create(null);
	var tombstones = [];

	normalized.forEach(function (site) {
		if (domains[site[0]])
			throw new Error('duplicate_domain');
		domains[site[0]] = true;
		if (safeSectionName(site[3]))
			selectedSections[site[3]] = true;
	});
	sections.forEach(function (section) {
		var generated = section.source === 'country_profile' &&
			/^(?:ru|by|cn)$/.test(section.profile_country || '') &&
			/^[a-z0-9_]{1,40}$/.test(section.profile_id || '');

		if (!generated)
			return;

		// Удаление профильной карточки запоминается выключенной секцией. Иначе
		// смена страны туда-обратно незаметно вернула бы сайт, удалённый родителем.
		if (section.enabled === '0' || !selectedSections[section['.name']])
			tombstones.push(section);
	});
	sections.forEach(function (section) { uci.remove(config, section['.name']); });
	normalized.forEach(function (site, index) {
		var preferred = safeSectionName(site[3]);
		var section = preferred && !used[preferred] ? preferred : nextSectionName(site[0], used);
		var actual = uci.add(config, sectionType, section) || section;

		if (actual !== section)
			throw new Error('named_section_not_supported');
		used[section] = true;
		site[3] = section;
		uci.set(config, section, 'domain', site[0]);
		uci.set(config, section, 'name', site[1]);
		uci.set(config, section, 'description', site[2]);
		uci.set(config, section, 'enabled', '1');
		uci.set(config, section, 'order', String(index + 1));
		if (site[4] === 'country_profile') {
			uci.set(config, section, 'source', site[4]);
			uci.set(config, section, 'profile_country', site[5]);
			uci.set(config, section, 'profile_id', site[6]);
		}
	});
	tombstones.forEach(function (saved) {
		var section = safeSectionName(saved['.name']);
		var domain = normalizeDomain(saved.domain);
		var actual;

		if (!section || !domain || used[section])
			return;
		actual = uci.add(config, sectionType, section) || section;
		if (actual !== section)
			throw new Error('named_section_not_supported');
		used[section] = true;
		uci.set(config, section, 'domain', domain);
		uci.set(config, section, 'name', String(saved.name || ''));
		uci.set(config, section, 'description', String(saved.description || ''));
		uci.set(config, section, 'enabled', '0');
		uci.set(config, section, 'order', String(parseInt(saved.order, 10) || 0));
		uci.set(config, section, 'source', 'country_profile');
		uci.set(config, section, 'profile_country', String(saved.profile_country));
		uci.set(config, section, 'profile_id', String(saved.profile_id));
	});

	// Возвращаем нормализованный снимок, чтобы после сохранения интерфейс сравнивал
	// данные с теми значениями, которые действительно попали в UCI. §emerg1
	return normalized;
}

return baseclass.extend({
	sectionType: sectionType,
	normalizeDomain: normalizeDomain,
	normalizeSite: normalizeSite,
	clone: clone,
	fromSections: fromSections,
	same: same,
	stage: stage
});
