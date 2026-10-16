import 'package:flutter_test/flutter_test.dart';
import 'package:serp_pos/models.dart';

FieldDef f(Map<String, dynamic> m) => FieldDef({'key': 'k', 'label': 'L', ...m});

void main() {
  test('required text', () {
    expect(validateField(f({'type': 'text', 'required': true}), null), isNotNull);
    expect(validateField(f({'type': 'text', 'required': true}), Answer(value: 'x')), isNull);
  });
  test('checklist needs a status when required', () {
    expect(validateField(f({'type': 'checklist', 'required': true}), Answer()), isNotNull);
    expect(validateField(f({'type': 'checklist', 'required': true}), Answer(status: 'na')), isNull);
  });
  test('checklist with options requires option when done', () {
    final fd = f({'type': 'checklist', 'required': true, 'options': ['2019', '2008']});
    expect(validateField(fd, Answer(status: 'done')), isNotNull);
    expect(validateField(fd, Answer(status: 'done', value: '2019')), isNull);
  });
  test('regex (AnyDesk 9-10 digits)', () {
    final fd = f({'type': 'number', 'required': true, 'validation': {'regex': r'^\d{9,10}$'}});
    expect(validateField(fd, Answer(value: '12345')), isNotNull);
    expect(validateField(fd, Answer(value: '123456789')), isNull);
  });
  test('number range and ip', () {
    expect(validateField(f({'type': 'number', 'validation': {'min': 1, 'max': 5}}), Answer(value: '9')), isNotNull);
    expect(validateField(f({'type': 'ip'}), Answer(value: '192.168.1.10')), isNull);
    expect(validateField(f({'type': 'ip'}), Answer(value: '999.1.1.1')), isNotNull);
  });
  test('date cannot be in the future', () {
    final fd = f({'type': 'date', 'required': true});
    final d = DateTime.now();
    String iso(DateTime x) => x.toIso8601String().substring(0, 10);
    expect(validateField(fd, Answer(value: iso(d))), isNull);
    expect(validateField(fd, Answer(value: iso(d.subtract(const Duration(days: 3))))), isNull);
    expect(validateField(fd, Answer(value: iso(d.add(const Duration(days: 2))))), isNotNull);
  });
  test('conditional visibility', () {
    final fd = f({'visibleIf': {'fieldKey': 'sql', 'equals': 'done'}});
    expect(isVisible(fd, {}), isFalse);
    expect(isVisible(fd, {'sql': Answer(status: 'done')}), isTrue);
  });
}
