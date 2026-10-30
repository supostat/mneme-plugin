Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      resources :invoices, only: [:index, :create, :show]
      resources :users, only: [:update]
    end
  end
end
