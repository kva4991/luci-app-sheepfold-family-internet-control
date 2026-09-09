"""Test-only UCI boundary model: config files plus global and private deltas.

Used by adminTransactionPendingRuntime, not a libuci replacement in production.
Load default deltas before private -t deltas, commit only the selected save path;
this distinction is checked against OpenWrt uci/delta.c. Fault switches exist only
in this model. All paths must be supplied inside the test fixture directory.
"""
import json
import os
import sys
from pathlib import Path

configs, pending, actions = [Path(item) for item in sys.argv[1:4]]
args = sys.argv[4:]
stage = pending
while args and args[0].startswith('-'):
    option = args.pop(0)
    if option in ('-t', '-p', '-P', '-c'):
        value = args.pop(0)
        if option in ('-t', '-P'):
            stage = Path(value)
operation = args[0]
expr = args[1] if len(args) > 1 else ''
key, _, value = expr.partition('=')
config = key.split('.')[0]
file = configs / config
if not file.exists():
    sys.exit(1)

def load_delta(directory):
    path = directory / (config + '.json')
    return json.loads(path.read_text()) if path.exists() else []

def apply(values, op, target, content):
    if op == 'set':
        values[target] = content
    elif op == 'delete':
        matching = [k for k in values if k == target or k.startswith(target + '.')]
        if not matching:
            return False
        for k in matching:
            del values[k]
    elif op in ('add_list', 'del_list'):
        prior = values.get(target, [])
        if not isinstance(prior, list):
            prior = [prior]
        if op == 'add_list':
            values[target] = prior + [content]
        else:
            values[target] = [v for v in prior if v != content]
    else:
        raise ValueError('Unsupported delta: ' + op)
    return True

base = json.loads(file.read_text())
global_delta = load_delta(pending)
private_delta = load_delta(stage) if stage != pending else []
for entry in global_delta + private_delta:
    apply(base, *entry)

if operation == 'changes':
    if os.environ.get('TEST_FAIL_CHANGES') == config:
        if os.environ.get('TEST_PARTIAL_CHANGES') == '1':
            print('partial')
        sys.exit(1)
    for entry in global_delta + private_delta:
        print(json.dumps(entry))
    sys.exit(0)
if operation == 'show':
    for k, v in base.items():
        if k == key or k.startswith(key + '.'):
            values = v if isinstance(v, list) else [v]
            formatted = ' '.join(repr(item) for item in values) if k.count('.') > 1 else str(v)
            print(k + '=' + formatted)
    sys.exit(0)
if operation == 'get':
    if key not in base:
        sys.exit(1)
    v = base[key]
    print(' '.join(v) if isinstance(v, list) else str(v))
    sys.exit(0)
with actions.open('a') as stream:
    stream.write(operation + ' ' + expr + '\n')
if os.environ.get('TEST_FAIL_OPERATION') == operation and os.environ.get('TEST_FAIL_KEY', key) == key:
    sys.exit(1)
if operation == 'commit':
    file.write_text(json.dumps(base))
    (stage / (config + '.json')).unlink(missing_ok=True)
    sys.exit(0)
if operation == 'revert':
    raise AssertionError('Tests prohibit reverting the shared draft wholesale')
if not apply(base, operation, key, value):
    sys.exit(1)
stage.mkdir(parents=True, exist_ok=True)
path = stage / (config + '.json')
entries = load_delta(stage)
entries.append([operation, key, value])
path.write_text(json.dumps(entries))

# One-shot simulation: an independent writer arrives after our first set.
mode = os.environ.get('TEST_CONCURRENT_CHANGE')
marker = actions.parent / 'concurrent-done'
if mode and operation == 'set' and not marker.exists():
    marker.write_text('done')
    target = config + ('.radio0.country' if config == 'wireless' else '.global.bedtime')
    value = 'DE' if config == 'wireless' else '23:00'
    if mode == 'pending':
        pending.mkdir(parents=True, exist_ok=True)
        other = load_delta(pending)
        other.append(['set', target, value])
        (pending / (config + '.json')).write_text(json.dumps(other))
    elif mode == 'committed':
        current = json.loads(file.read_text())
        current[target] = value
        file.write_text(json.dumps(current))
