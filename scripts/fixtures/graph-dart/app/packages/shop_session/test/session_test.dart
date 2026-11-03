import 'package:shop_session/session.dart';
import 'package:test/test.dart';

void main() {
  test('a token keeps its value', () => expect(const Token('t').value, 't'));
}
