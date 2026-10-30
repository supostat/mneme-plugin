module Billing
  class IssueInvoice
    def call(user)
      invoice = Invoice.create!(user: user)
      Ledger.record(invoice)
      invoice
    end
  end
end
