import type {
  AccountGroupItem,
  SocialAccount,
  UpdateAccountStatisticsParams,
} from '@/api/types/account.type'
// 创建或更新账户
import http from '@/utils/request'

export function createOrUpdateAccountApi(data: Partial<SocialAccount>) {
  return http.post<SocialAccount>('v2/channels/accounts', data)
}

// 更新账户
export function updateAccountApi(data: Partial<SocialAccount>) {
  return http.patch<SocialAccount>(`v2/channels/accounts/${data.id}`, data)
}

// 更新账户状态
export function updateAccountStatusApi(data: { id: string, status: number }) {
  return http.patch<SocialAccount>(`v2/channels/accounts/${data.id}`, data)
}

// 获取账户列表
export async function getAccountListApi() {
  const res: any = await http.get<{ list: SocialAccount[], total: number }>('v2/channels/accounts')
  if (res?.code === 0 && res.data?.list)
    return { ...res, data: res.data.list }
  return res
}

// 获取账户详情
export function getAccountDetailApi(id: string) {
  return http.get<SocialAccount>(`v2/channels/accounts/${id}`)
}

export function updateAccountStatisticsApi(data: UpdateAccountStatisticsParams) {
  return http.post<SocialAccount>('account/statistics/update', data)
}

// 删除账户
export function deleteAccountApi(id: string) {
  return http.delete<SocialAccount>(`v2/channels/accounts/${id}`)
}

// 删除多个账户
export function deleteAccountsApi(ids: string[]) {
  return http.delete<SocialAccount>('v2/channels/accounts', { ids })
}

// 创建账户组
export function createAccountGroupApi(data: Partial<AccountGroupItem>) {
  return http.post('v2/channels/account-groups', data)
}

// 更新账户组
export function updateAccountGroupApi(data: Partial<AccountGroupItem>) {
  return http.patch(`v2/channels/account-groups/${data.id}`, data)
}

// 删除账户组
export function deleteAccountGroupApi(ids: string[]) {
  return http.delete('v2/channels/account-groups', { ids })
}

// 获取所有账户组
export async function getAccountGroupApi() {
  const res: any = await http.get<AccountGroupItem[]>('v2/channels/account-groups')
  // res.data.push({
  //   id: "68a6d3e5861d0b23ca010123",
  //   ip: "188.166.188.86",
  //   isDefault: false,
  //   location: "AU",
  //   name: "测试外网",
  //   proxyIp: "188.166.188.86",
  //   rank: 1,
  //   userId: "689aea2a2b50f147c09f01bc",
  //   _id: "68a6d3e5861d0b23ca010123",
  // });

  return res
}
