library order_list_test;

import 'package:shop_app/orders/order_list.dart';
import 'package:test/test.dart';

part 'order_list_steps.dart';

void main() {
  test('a list keeps its rows', () => expect(emptyRows(), isEmpty));
}
