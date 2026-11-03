import 'contract_status.dart';

interface class ContractClient {
  ContractStatus fetch() => ContractStatus.open;
}
