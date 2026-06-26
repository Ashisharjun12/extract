import { adminClient, mapApiError, unwrap } from './client'

export { mapApiError }

export async function validateApiKey(key) {
  const { data } = await adminClient.get('/api/v1/admin/queues/health', {
    headers: { 'x-admin-api-key': key },
  })
  return data
}

export async function getQueueHealth() {
  const { data } = await adminClient.get('/api/v1/admin/queues/health')
  return data
}

export async function getDLQJobs({ page = 1, limit = 20 } = {}) {
  const { data } = await adminClient.get('/api/v1/admin/dlq/jobs', {
    params: { page, limit },
  })
  return data
}

export async function replayDLQJob(id) {
  const { data } = await adminClient.post(`/api/v1/admin/dlq/jobs/${id}/replay`)
  return data
}

export async function discardDLQJob(id) {
  const { data } = await adminClient.delete(`/api/v1/admin/dlq/jobs/${id}`)
  return data
}

export async function testAdminHealth() {
  const start = performance.now()
  try {
    const { data } = await adminClient.get('/api/v1/admin/health')
    return {
      ok: data?.status === 200 || Boolean(data?.message),
      status: 200,
      message: data?.message ?? 'OK',
      latencyMs: Math.round(performance.now() - start),
      checkedAt: new Date().toISOString(),
    }
  } catch (error) {
    return {
      ok: false,
      status: error.response?.status ?? 0,
      message: mapApiError(error),
      latencyMs: null,
      checkedAt: new Date().toISOString(),
    }
  }
}

export async function testHealthRoute() {
  return testAdminHealth()
}
