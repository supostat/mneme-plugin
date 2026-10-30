module Access
  class Grant
    def call(user)
      user.update!(granted: true)
      User.notify(user)
    end
  end
end
