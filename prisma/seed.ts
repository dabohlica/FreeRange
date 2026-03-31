import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = 'admin@traveltrace.local'

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } })
  if (existing) {
    console.log('Admin user already exists')
    return
  }

  const password = process.env.ADMIN_PASSWORD || 'admin'
  const hashed = await bcrypt.hash(password, 12)

  await prisma.user.create({
    data: {
      email: adminEmail,
      password: hashed,
      name: 'Admin',
      role: 'ADMIN',
    },
  })

  console.log('Admin user created')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
