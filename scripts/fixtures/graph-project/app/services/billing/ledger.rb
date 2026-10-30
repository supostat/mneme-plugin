module Billing
  class Ledger
    def self.record(invoice)
      entries << invoice.total
    end

    def self.entries
      @entries ||= []
    end
  end
end
