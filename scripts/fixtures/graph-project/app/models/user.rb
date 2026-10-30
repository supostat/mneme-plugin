class User < ApplicationRecord
  has_many :invoices

  def self.notify(user)
    Mailer.granted(user).deliver_later
  end
end
