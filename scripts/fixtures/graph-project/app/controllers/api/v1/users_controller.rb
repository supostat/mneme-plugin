module Api
  module V1
    class UsersController < ApplicationController
      def update
        Access::Grant.new.call(User.find(params[:id]))
        head :no_content
      end
    end
  end
end
