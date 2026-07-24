import { z } from 'zod'

export const AddressSchema = z.object({
  full_name:    z.string().min(2).max(100),
  line1:        z.string().min(3).max(200),
  line2:        z.string().max(200).optional(),
  city:         z.string().min(2).max(100),
  state:        z.string().min(2).max(100),
  postal_code:  z.string().min(3).max(20),
  country:      z.string().length(2), // ISO 3166-1 alpha-2
  phone:        z.string().max(20).optional(),
})

export const CheckoutSchema = z.object({
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity:   z.number().int().min(1).max(100),
  })).min(1),
  shipping_address: AddressSchema,
  turnstile_token:  z.string().min(1),
})

export const ProductSchema = z.object({
  name:          z.string().min(1).max(255),
  slug:          z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
  description:   z.string().max(10000).optional(),
  price:         z.number().min(0),
  compare_price: z.number().min(0).optional(),
  stock:         z.number().int().min(0),
  category_id:   z.string().uuid().optional(),
  is_active:     z.boolean().default(true),
})

export const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8).max(128),
})

export const SignupSchema = LoginSchema.extend({
  full_name: z.string().min(2).max(100),
})

export type Address       = z.infer<typeof AddressSchema>
export type CheckoutInput = z.infer<typeof CheckoutSchema>
export type ProductInput  = z.infer<typeof ProductSchema>
export type LoginInput    = z.infer<typeof LoginSchema>
export type SignupInput   = z.infer<typeof SignupSchema>
