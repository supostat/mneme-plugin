class Invoice < ApplicationRecord
  belongs_to :user

  def total
    lines.sum(&:amount)
  end
end
