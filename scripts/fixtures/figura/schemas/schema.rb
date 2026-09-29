# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.

ActiveRecord::Schema[7.2].define(version: 2026_09_01_120000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pgcrypto"
  enable_extension "plpgsql"

  # Custom types defined in this database.
  # Note that some types may not work with other database engines. Be careful if changing database.
  create_enum "account_role", ["ADMIN", "MEMBER"]

  create_table "_ProductToTag", primary_key: ["A", "B"], force: :cascade do |t|
    t.bigint "A", null: false
    t.integer "B", null: false
    t.index ["B"], name: "_ProductToTag_B_index"
  end

  create_table "accounts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "email", limit: 320, null: false
    t.text "display_name"
    t.enum "role", default: "MEMBER", null: false, enum_type: "account_role"
    t.datetime "created_at", precision: 3, default: -> { "CURRENT_TIMESTAMP" }, null: false
    t.datetime "updated_at", precision: 3, null: false
    t.datetime "deleted_at", precision: 3
    t.index ["email"], name: "accounts_email_key", unique: true
    t.index ["display_name"], name: "accounts_live_display_name", unique: true, where: "(deleted_at IS NULL)"
  end

  create_table "categories", force: :cascade do |t|
    t.string "name", limit: 64, null: false
    t.bigint "parent_id"
  end

  create_table "credentials", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "password_hash", null: false
    t.uuid "account_id", null: false
    t.index ["account_id"], name: "credentials_account_id_key", unique: true
  end

  create_table "order_item", primary_key: ["order_id", "product_id"], force: :cascade do |t|
    t.uuid "order_id", null: false
    t.bigint "product_id", null: false
    t.integer "quantity", null: false
  end

  create_table "orders", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.integer "number", null: false
    t.timestamptz "placed_at", null: false
    t.jsonb "metadata", default: {}
    t.datetime "created_at", precision: 3, default: -> { "CURRENT_TIMESTAMP" }, null: false
    t.uuid "account_id", null: false
    t.index ["account_id", "number"], name: "orders_account_id_number_key", unique: true
  end

  create_table "products", force: :cascade do |t|
    t.string "sku", limit: 32, null: false
    t.text "title", null: false
    t.decimal "price", precision: 10, scale: 2, null: false
    t.bigint "category_id"
    t.index ["sku"], name: "products_sku_key", unique: true
  end

  create_table "tags", id: :serial, force: :cascade do |t|
    t.string "label", limit: 64, null: false
    t.index ["label"], name: "tags_label_key", unique: true
  end

  add_foreign_key "_ProductToTag", "products", column: "A", on_update: :cascade, on_delete: :cascade
  add_foreign_key "_ProductToTag", "tags", column: "B", on_update: :cascade, on_delete: :cascade
  add_foreign_key "categories", "categories", column: "parent_id", on_update: :cascade, on_delete: :nullify
  add_foreign_key "credentials", "accounts", on_update: :cascade
  add_foreign_key "order_item", "orders", on_update: :cascade
  add_foreign_key "order_item", "products", on_update: :cascade
  add_foreign_key "orders", "accounts", on_update: :cascade
  add_foreign_key "products", "categories", on_update: :cascade, on_delete: :nullify
end
