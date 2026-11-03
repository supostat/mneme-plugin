import 'package:shop_contract/shop_contract.dart';
import 'package:test/test.dart';

void main() {
  test('a fresh contract is open', () => expect(ContractClient().fetch(), ContractStatus.open));
}
