import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getOrCreateUser } from "@/lib/users";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress || "";
  const firstName = clerkUser?.firstName || "";
  const lastName  = clerkUser?.lastName  || "";
  const name = [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0] || "User";

  const user = await getOrCreateUser(userId, { email, name });

  return NextResponse.json({
    id:      user.id,
    clerkId: user.clerkId,
    name:    user.name,
    email:   user.email,
    role:    user.role,
    status:  user.status,
  });
}
