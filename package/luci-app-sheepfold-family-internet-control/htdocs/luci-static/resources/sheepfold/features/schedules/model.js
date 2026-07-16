'use strict';
'require baseclass';

function timeToMinutes(value) {
	var parts = String(value || '').split(':');
	var hours = parseInt(parts[0], 10);
	var minutes = parseInt(parts[1], 10);

	if (parts.length !== 2 || isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59)
		return -1;

	return hours * 60 + minutes;
}

function ranges(section, listValues) {
	var values = listValues(section.time_ranges);

	if (!values.length && section.start_time && section.end_time)
		values = [section.start_time + '-' + section.end_time];

	return values.map(function (value) {
		var parts = value.split('-');
		return { start: parts[0] || '', end: parts[1] || '' };
	});
}

function dayText(section, listValues, days) {
	var selectedDays = listValues(section.weekdays);
	var weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'];

	if (selectedDays.length === 7)
		return _('Every day');
	if (weekdays.every(function (day) { return selectedDays.indexOf(day) !== -1; }) && selectedDays.length === 5)
		return _('Weekdays');
	if (selectedDays.length === 2 && selectedDays.indexOf('sat') !== -1 && selectedDays.indexOf('sun') !== -1)
		return _('Weekends');

	return days.filter(function (item) {
		return selectedDays.indexOf(item[0]) !== -1;
	}).map(function (item) { return _(item[1]); }).join(', ') || _('No days selected');
}

function timeText(section, listValues) {
	var values = listValues(section.time_ranges);

	if (!values.length && section.start_time && section.end_time)
		values = [section.start_time + '-' + section.end_time];

	return values.map(function (range) {
		var parts = range.split('-');
		if (parts.length === 2 && parts[1] < parts[0])
			return parts[0] + '\u2013' + parts[1] + ' ' + _('next day');
		return range.replace('-', '\u2013');
	}).join(', ') || _('Time is not set');
}

function windows(days, runs, dayDefinitions) {
	var result = [];

	days.forEach(function (day) {
		var dayIndex = dayDefinitions.findIndex(function (item) { return item[0] === day; });

		if (dayIndex < 0)
			return;

		runs.forEach(function (run) {
			var start = timeToMinutes(run.start);
			var end = timeToMinutes(run.end);
			var base = dayIndex * 1440;

			if (start < 0 || end < 0 || start === end)
				return;
			if (end < start)
				end += 1440;
			result.push([base + start, base + end]);
		});
	});

	return result;
}

function windowsOverlap(left, right) {
	var week = 7 * 1440;

	return left.some(function (first) {
		return right.some(function (second) {
			return [-week, 0, week].some(function (shift) {
				return first[0] < second[1] + shift && second[0] + shift < first[1];
			});
		});
	});
}

return baseclass.extend({
	timeToMinutes: timeToMinutes,
	ranges: ranges,
	dayText: dayText,
	timeText: timeText,
	windows: windows,
	windowsOverlap: windowsOverlap
});
