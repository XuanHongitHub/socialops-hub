import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    code: 0,
    data: {
      id: 'local-admin',
      name: 'Admin',
      mail: 'admin@bugsell.com',
      userType: 'CREATOR',
      avatar: '',
    },
    message: 'ok',
    url: '/api/user/mine',
  })
}
