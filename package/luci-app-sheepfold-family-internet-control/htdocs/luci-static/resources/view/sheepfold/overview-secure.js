'use strict';
'require view.sheepfold.overview as overview';

/*
 * Compatibility wrapper around the large overview view.
 *
 * AI configuration used to be embedded in the General settings panel. The
 * dedicated sheepfold/ai view now owns those options, including enablement,
 * per-device quotas, and OpenSSL-gated individual logs. Keeping both editors
 * visible would expose obsolete model defaults and two competing save paths.
 */
var renderSettingsGeneral = overview.renderSettingsGeneral;

overview.renderSettingsGeneral = function() {
	var node = renderSettingsGeneral.apply(this, arguments);
	var children = Array.prototype.slice.call(node.children || []);

	/*
	 * Current General order:
	 * 0 language, 1 port, 2 new-device policy, 3 auto-configure,
	 * 4 updates, 5..9 legacy AI fields, 10+ remaining settings.
	 */
	children.slice(5, 10).forEach(function(child) {
		child.remove();
	});

	return node;
};

return overview;
