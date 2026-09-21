export interface HolidayItem {
  date: string
  name: string
  type: 'holiday' | 'workday'
}

interface HolidayResponse {
  code: number
  msg: string
  data: HolidayItem[]
}

const API_BASE = 'https://api.apisbo.com/holidays/year'

export async function fetchHolidays(year: number): Promise<HolidayItem[]> {
  const res = await fetch(`${API_BASE}/${year}`)
  if (!res.ok) {
    throw new Error(`节假日接口请求失败：HTTP ${res.status}`)
  }
  const json = (await res.json()) as HolidayResponse
  if (json.code !== 0) {
    throw new Error(`节假日接口返回错误：${json.msg}`)
  }
  return json.data
}