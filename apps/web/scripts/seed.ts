import bcrypt from "bcryptjs";
import { prisma } from "@localfirst/db";

const users = [
  { name: "Alice Owner", email: "alice@example.com", password: "password123" },
  { name: "Bob Editor", email: "bob@example.com", password: "password123" },
  { name: "Carol Viewer", email: "carol@example.com", password: "password123" },
];

async function main() {
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, passwordHash },
      create: { email: u.email, name: u.name, passwordHash },
    });
    console.log(`Seeded ${u.email} / ${u.password}`);
  }
  console.log("Done. Sign in with any seeded account (password: password123).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
