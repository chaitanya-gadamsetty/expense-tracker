// Minimal Google Drive v3 client for the shared household file. With the drive.file scope every call
// only ever sees files this app created or that were picked in Google's file picker.

export interface DriveFile {
  id: string
  name: string
  modifiedTime?: string
  ownedByMe?: boolean
  parents?: string[]
}

/** The operations sync needs — an interface so tests can use an in-memory fake. */
export interface DriveApi {
  /** Files (not trashed) with exactly this name, newest first. */
  findByName(name: string, parentId?: string): Promise<DriveFile[]>
  /** Files in a folder whose name starts with `prefix`. */
  listByPrefix(parentId: string, prefix: string): Promise<DriveFile[]>
  /** Metadata, or null if the file is gone or no longer shared with this account. */
  get(id: string): Promise<DriveFile | null>
  readText(id: string): Promise<string>
  createFolder(name: string): Promise<DriveFile>
  create(name: string, body: Blob, parentId?: string): Promise<DriveFile>
  update(id: string, body: Blob): Promise<void>
  copy(id: string, name: string, parentId: string): Promise<void>
  remove(id: string): Promise<void>
  /** Gives this email edit access; Google emails them a link. */
  share(id: string, email: string): Promise<void>
  /** Who has access, for display. */
  sharedWith(id: string): Promise<string[]>
  /** Email of the signed-in account. */
  me(): Promise<string>
}

export class DriveAuthError extends Error {
  constructor() {
    super('Google sign-in has expired.')
  }
}

export class DriveNotFoundError extends Error {
  constructor() {
    super('The shared household file was not found.')
  }
}

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FIELDS = 'id, name, modifiedTime, ownedByMe, parents'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

export function googleDrive(token: string): DriveApi {
  const call = async (url: string, init: RequestInit = {}) => {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string>) } })
    if (res.status === 401) throw new DriveAuthError()
    if (res.status === 404 && init.method !== 'DELETE') throw new DriveNotFoundError()
    if (!res.ok && !(init.method === 'DELETE' && res.status === 404)) {
      let detail = ''
      try { detail = (await res.json())?.error?.message ?? '' } catch { /* ignore */ }
      throw new Error(`Google Drive error ${res.status}${detail ? `: ${detail}` : ''}`)
    }
    return res
  }

  const list = async (q: string) => {
    const files: DriveFile[] = []
    let pageToken = ''
    do {
      const params = new URLSearchParams({
        q,
        fields: `nextPageToken, files(${FIELDS})`,
        orderBy: 'modifiedTime desc',
        pageSize: '100',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        ...(pageToken ? { pageToken } : {}),
      })
      const data = await (await call(`${API}/files?${params}`)).json()
      files.push(...(data.files ?? []))
      pageToken = data.nextPageToken ?? ''
    } while (pageToken)
    return files
  }

  const upload = async (meta: object, body: Blob) => {
    const boundary = 'et' + Math.random().toString(36).slice(2)
    const multipart = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: ${body.type || 'application/octet-stream'}\r\n\r\n`,
      body,
      `\r\n--${boundary}--`,
    ])
    const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=${encodeURIComponent(FIELDS)}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    })
    return (await res.json()) as DriveFile
  }

  return {
    findByName: (name, parentId) =>
      list(`name = ${quote(name)} and trashed = false and mimeType != ${quote(FOLDER_MIME)}${parentId ? ` and ${quote(parentId)} in parents` : ''}`),
    listByPrefix: (parentId, prefix) => list(`${quote(parentId)} in parents and name contains ${quote(prefix)} and trashed = false`).then((fs) => fs.filter((f) => f.name.startsWith(prefix))),
    async get(id) {
      try {
        const f = (await (await call(`${API}/files/${id}?fields=${encodeURIComponent(FIELDS + ', trashed')}&supportsAllDrives=true`)).json()) as DriveFile & { trashed?: boolean }
        return f.trashed ? null : f
      } catch (e) {
        if (e instanceof DriveNotFoundError) return null
        throw e
      }
    },
    async readText(id) {
      return (await call(`${API}/files/${id}?alt=media&supportsAllDrives=true`)).text()
    },
    async createFolder(name) {
      const res = await call(`${API}/files?fields=${encodeURIComponent(FIELDS)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
      })
      return (await res.json()) as DriveFile
    },
    create: (name, body, parentId) => upload({ name, ...(parentId ? { parents: [parentId] } : {}) }, body),
    async update(id, body) {
      await call(`${UPLOAD}/files/${id}?uploadType=media&supportsAllDrives=true`, {
        method: 'PATCH',
        headers: { 'Content-Type': body.type || 'application/octet-stream' },
        body,
      })
    },
    async copy(id, name, parentId) {
      await call(`${API}/files/${id}/copy?supportsAllDrives=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parents: [parentId] }),
      })
    },
    async remove(id) {
      await call(`${API}/files/${id}?supportsAllDrives=true`, { method: 'DELETE' })
    },
    async share(id, email) {
      await call(`${API}/files/${id}/permissions?sendNotificationEmail=true&supportsAllDrives=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: email }),
      })
    },
    async sharedWith(id) {
      const data = await (await call(`${API}/files/${id}/permissions?fields=permissions(emailAddress,role)&supportsAllDrives=true`)).json()
      return ((data.permissions ?? []) as Array<{ emailAddress?: string }>).map((p) => p.emailAddress ?? '').filter(Boolean)
    },
    async me() {
      const data = await (await call(`${API}/about?fields=user(emailAddress)`)).json()
      return data.user?.emailAddress ?? ''
    },
  }
}
