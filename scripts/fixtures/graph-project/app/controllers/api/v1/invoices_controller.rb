module Api
  module V1
    class InvoicesController < ApplicationController
      def create
        invoice = Billing::IssueInvoice.new.call(current_user)
        render json: InvoiceSerializer.one(invoice)
      end
    end
  end
end
