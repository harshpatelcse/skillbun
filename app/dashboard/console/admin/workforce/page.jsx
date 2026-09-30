'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { useAuth } from '@/app/components/AuthProvider'
import { useAdminAccess } from '@/utils/client/adminAuth'
import { getFirebaseServices } from '@/utils/client/firebaseClient'
import { collection, getDocs } from 'firebase/firestore'
import { downloadBase64Pdf as downloadUnifiedBase64Pdf } from '@/utils/client/printAndDownload'
import { subscribeDataSync, notifyDataMutated } from '@/utils/client/dataSyncManager'
import styles from './workforce.module.css'

const STATUS_TABS = [
  { key: 'ALL', label: 'All' },
  { key: 'OFFER_SENT', label: 'Offer Sent' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'EXPIRING_SOON', label: 'Expiring Soon' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'TERMINATED', label: 'Terminated' },
]

export const PRESET_COURSES = [
  'B.Tech - Computer Science & Engineering (CSE)',
  'B.Tech - Information Technology (IT)',
  'B.Tech - Artificial Intelligence & Data Science (AI/DS)',
  'B.Tech - Electronics & Communication (ECE)',
  'B.Tech - Electrical Engineering (EE)',
  'B.Tech - Mechanical Engineering (ME)',
  'B.Tech - Civil Engineering (CE)',
  'B.Tech / B.E. (Other Specialization)',
  'BCA (Bachelor of Computer Applications)',
  'MCA (Master of Computer Applications)',
  'B.Sc - Computer Science',
  'B.Sc - Information Technology',
  'B.Sc - Data Science / Statistics / Mathematics',
  'M.Sc - Computer Science / IT',
  'M.Tech / M.E. (Computer Science / Engineering)',
  'BBA (Bachelor of Business Administration)',
  'MBA (Master of Business Administration)',
  'B.Des / M.Des (Design / UI-UX / Interaction)',
  'B.Com / M.Com',
  'Diploma in Computer Science / IT / Polytechnic',
]

export const PRESET_DEPARTMENTS = [
  'Engineering & Technology',
  'Frontend Web Development',
  'Backend & Cloud Engineering',
  'Full-Stack Web Development',
  'AI & Machine Learning',
  'UI/UX & Product Design',
  'Product Management',
  'Content & Technical Writing',
  'Social Media & PR',
  'Marketing & Growth',
  'Human Resources & Talent Acquisition',
  'Operations & Management',
]

export const DEPARTMENT_DESIGNATIONS = {
  'Engineering & Technology': {
    INTERN: [
      'Software Engineer Intern',
      'Engineering Intern',
      'QA & Testing Intern',
      'DevOps Intern',
    ],
    EMPLOYEE: [
      'Software Engineer',
      'Senior Software Engineer',
      'Lead Software Engineer',
      'QA Automation Engineer',
      'DevOps & Cloud Engineer',
      'Engineering Manager',
    ],
  },
  'Frontend Web Development': {
    INTERN: [
      'Frontend Developer Intern',
      'React / Next.js Developer Intern',
      'UI Developer Intern',
    ],
    EMPLOYEE: [
      'Frontend Engineer',
      'Senior Frontend Engineer',
      'Lead Frontend Engineer',
    ],
  },
  'Backend & Cloud Engineering': {
    INTERN: [
      'Backend Developer Intern',
      'Cloud Engineering Intern',
      'Node.js / API Intern',
    ],
    EMPLOYEE: [
      'Backend Engineer',
      'Senior Backend Engineer',
      'Lead Backend Engineer',
      'Cloud Architect',
    ],
  },
  'Full-Stack Web Development': {
    INTERN: [
      'Full Stack Developer Intern',
      'Web Development Intern',
    ],
    EMPLOYEE: [
      'Full Stack Engineer',
      'Senior Full Stack Engineer',
      'Lead Full Stack Engineer',
    ],
  },
  'AI & Machine Learning': {
    INTERN: [
      'AI / ML Engineer Intern',
      'Generative AI Intern',
      'Data Science Intern',
    ],
    EMPLOYEE: [
      'AI / ML Engineer',
      'Senior AI Engineer',
      'LLM & Applied AI Lead',
      'Data Scientist',
    ],
  },
  'UI/UX & Product Design': {
    INTERN: [
      'UI/UX Design Intern',
      'Product Design Intern',
      'Visual Design Intern',
    ],
    EMPLOYEE: [
      'UI/UX Designer',
      'Senior Product Designer',
      'Lead Product Designer',
      'Design Lead',
    ],
  },
  'Product Management': {
    INTERN: [
      'Product Management Intern',
      'Associate Product Intern',
    ],
    EMPLOYEE: [
      'Associate Product Manager',
      'Product Manager',
      'Senior Product Manager',
      'Lead Product Manager',
    ],
  },
  'Content & Technical Writing': {
    INTERN: [
      'Content & Technical Writer Intern',
      'Curriculum Content Intern',
      'Technical Documentation Intern',
    ],
    EMPLOYEE: [
      'Technical Writer',
      'Senior Technical Writer',
      'Content Lead / Technical Writer',
      'Curriculum Lead',
    ],
  },
  'Social Media & PR': {
    INTERN: [
      'Social Media & PR Intern',
      'Community & PR Intern',
      'Brand & Social Media Intern',
    ],
    EMPLOYEE: [
      'Social Media & PR Lead',
      'PR & Communications Manager',
      'Community & Brand Manager',
    ],
  },
  'Marketing & Growth': {
    INTERN: [
      'Digital Marketing & Growth Intern',
      'SEO & Performance Marketing Intern',
      'Growth Intern',
    ],
    EMPLOYEE: [
      'Growth & Marketing Specialist',
      'Growth & Marketing Manager',
      'SEO & Performance Lead',
    ],
  },
  'Human Resources & Talent Acquisition': {
    INTERN: [
      'Human Resources (HR) Intern',
      'Talent Acquisition Intern',
      'People Operations Intern',
    ],
    EMPLOYEE: [
      'HR Specialist',
      'Talent Acquisition Lead',
      'Human Resources (HR) Lead',
      'People & Culture Manager',
    ],
  },
  'Operations & Management': {
    INTERN: [
      'Operations Intern',
      'Project Operations Intern',
      'Business Operations Intern',
    ],
    EMPLOYEE: [
      'Operations Associate',
      'Operations Lead',
      'Operations Manager',
      'Business Operations Manager',
    ],
  },
}

export function getDesignationsFor(department, employmentType) {
  const roleType = employmentType === 'INTERN' ? 'INTERN' : 'EMPLOYEE'
  if (department && DEPARTMENT_DESIGNATIONS[department]) {
    return DEPARTMENT_DESIGNATIONS[department][roleType] || []
  }
  const all = new Set()
  for (const dept of Object.values(DEPARTMENT_DESIGNATIONS)) {
    for (const d of (dept[roleType] || [])) {
      all.add(d)
    }
  }
  return Array.from(all)
}

const EMPTY_FORM = {
  salutation: 'Mr.',
  full_name: '',
  parent_name: '',
  personal_email: '',
  phone: '',
  course_degree: '',
  college_name: '',
  current_address: '',
  permanent_address: '',
  employment_type: 'INTERN',
  department: '',
  designation: '',
  joining_date: '',
  contract_end_date: '',
  stipend_amount: '0',
  stipend_currency: 'INR',
  work_email: '',
  credentials_data: { work_email: '', password: '', access_notes: '' },
  skip_offer_email: false,
}

function Icon({ name, size = 18, style }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    edit: <><path d="m4 20 4.2-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" /><path d="m13.8 7.4 3 3" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    alert: <><path d="M12 3 2.9 20h18.2L12 3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-4.2L3 9" /><path d="M3 4v5h5" /><path d="M4 13a8 8 0 0 0 14.8 4.2L21 15" /><path d="M21 20v-5h-5" /></>,
    trash: <><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>,
    mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    certificate: <><path d="M12 15l-2 5l4-2l4 2l-2-5" /><circle cx="12" cy="9" r="6" /></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
    award: <><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    link: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
    check: <polyline points="20 6 9 17 4 12" />,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    analytics: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
    sun: <><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></>,
    moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name] || null}
    </svg>
  )
}

function dateOnly(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function calculateExtensionDate(baseDateStr, months) {
  const base = baseDateStr ? new Date(`${dateOnly(baseDateStr)}T00:00:00`) : new Date()
  const y = base.getFullYear()
  const m = base.getMonth()
  const d = base.getDate()
  const target = new Date(y, m + months, d)
  const yyyy = target.getFullYear()
  const mm = String(target.getMonth() + 1).padStart(2, '0')
  const dd = String(target.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function daysUntil(value) {
  if (!value) return null
  const end = new Date(`${dateOnly(value)}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((end.getTime() - today.getTime()) / 86400000)
}

function tenureMeta(employee) {
  const days = daysUntil(employee.contract_end_date)
  if (days === null || !['ACTIVE', 'EXTENDED'].includes(employee.status)) return null
  if (days <= 10) return { tone: 'critical', label: days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining` }
  if (days <= 30) return { tone: 'warning', label: `${days}d remaining` }
  return { tone: 'good', label: `${days}d remaining` }
}

function statusLabel(status) {
  return String(status || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formFromEmployee(employee) {
  return {
    ...EMPTY_FORM,
    ...employee,
    joining_date: dateOnly(employee.joining_date),
    contract_end_date: dateOnly(employee.contract_end_date),
    stipend_amount: String(employee.stipend_amount ?? 0),
    // Credentials are intentionally never returned by the API. Keep this section blank
    // during edits so unchanged encrypted values are preserved server-side.
    credentials_data: { ...EMPTY_FORM.credentials_data },
    skip_offer_email: false,
  }
}

function toPayload(form, { includeStatus = false } = {}) {
  const credentials = form.credentials_data
  const hasCredentialInput = Boolean(credentials.work_email || credentials.password || credentials.access_notes)
  const payload = {
    salutation: form.salutation,
    full_name: form.full_name.trim(),
    parent_name: form.parent_name.trim(),
    personal_email: form.personal_email.trim().toLowerCase(),
    phone: form.phone.trim(),
    course_degree: form.course_degree.trim(),
    college_name: form.college_name.trim(),
    current_address: form.current_address.trim(),
    permanent_address: form.permanent_address.trim(),
    employment_type: form.employment_type,
    department: form.department.trim(),
    designation: form.designation.trim(),
    joining_date: form.joining_date,
    contract_end_date: form.contract_end_date,
    stipend_amount: Number(form.stipend_amount),
    stipend_currency: 'INR',
    skip_offer_email: Boolean(form.skip_offer_email),
  }

  if (form.work_email.trim()) payload.work_email = form.work_email.trim().toLowerCase()
  if (hasCredentialInput) {
    payload.credentials_data = {
      work_email: (credentials.work_email || form.work_email).trim().toLowerCase(),
      password: credentials.password,
      access_notes: credentials.access_notes.trim(),
    }
  }
  if (includeStatus && form.status) payload.status = form.status
  return payload
}

export default function WorkforcePage() {
  const router = useRouter()
  const { user, authLoading } = useAuth()
  const { isAdmin, isFounder, role, checking } = useAdminAccess(user, authLoading)
  const [employees, setEmployees] = useState([])
  const [pagination, setPagination] = useState({ has_more: false, next_page_token: null })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('ALL')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('full_name')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [courseSelect, setCourseSelect] = useState('')
  const [deptSelect, setDeptSelect] = useState('')
  const [desigSelect, setDesigSelect] = useState('')
  const [sameAddress, setSameAddress] = useState(false)
  const [extensionTarget, setExtensionTarget] = useState(null)
  const [extensionMonths, setExtensionMonths] = useState('3')
  const [customExtensionDate, setCustomExtensionDate] = useState('')
  const [terminationReasonCode, setTerminationReasonCode] = useState('COMPLETED')
  const [terminationReason, setTerminationReason] = useState('')
  const [grantInternshipCert, setGrantInternshipCert] = useState(false)
  const [grantTrainingCert, setGrantTrainingCert] = useState(false)
  const [grantLor, setGrantLor] = useState(false)
  const [revokeAccess, setRevokeAccess] = useState(true)
  const [sendTerminationEmail, setSendTerminationEmail] = useState(true)
  const [emailPreview, setEmailPreview] = useState(null)
  const [pdfPreview, setPdfPreview] = useState(null)
  const [previewTheme, setPreviewTheme] = useState('dark')
  const [dispatchFallback, setDispatchFallback] = useState(null)
  const [activationTarget, setActivationTarget] = useState(null)
  const [activationCreds, setActivationCreds] = useState({ work_email: '', password: '', access_notes: '' })
  const [showActivationPassword, setShowActivationPassword] = useState(false)
  const [employeeToDelete, setEmployeeToDelete] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const showToast = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 4000)
  }

  const redirectDenied = () => {
    if (user?.email?.toLowerCase().trim() === 'harsh@skillbun.tech') return
    showToast('Workforce Hub is restricted to authorised administrators.')
    window.setTimeout(() => router.replace('/dashboard'), 850)
  }

  const request = async (url, options = {}) => {
    const token = await user.getIdToken()
    const response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    })
    const data = await response.json().catch(() => ({}))
    if (response.status === 401 || response.status === 403) {
      redirectDenied()
      throw new Error('Admin access is required.')
    }
    if (!response.ok) throw new Error(data?.error?.message || 'The workforce request could not be completed.')

    if (options.method && options.method.toUpperCase() !== 'GET') {
      notifyDataMutated('admin:workforce')
      if (typeof url === 'string' && url.includes('/certify/mint')) {
        notifyDataMutated('admin:certs')
      }
    }

    return data
  }

  const loadEmployees = async ({ append = false, pageToken = null } = {}) => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (pageToken) params.set('pageToken', pageToken)
      const data = await request(`/api/admin/workforce/employees?${params.toString()}`)
      setEmployees((current) => append ? [...current, ...(data.employees || [])] : (data.employees || []))
      setPagination(data.pagination || { has_more: false, next_page_token: null })
    } catch (loadError) {
      try {
        const { db } = getFirebaseServices()
        if (db) {
          const snap = await getDocs(collection(db, 'employees'))
          const empList = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          setEmployees(empList)
          setPagination({ has_more: false, next_page_token: null })
        } else {
          if (!/Admin access/.test(loadError.message)) setError(loadError.message)
        }
      } catch {
        if (!/Admin access/.test(loadError.message)) setError(loadError.message)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      const deniedTimer = window.setTimeout(redirectDenied, 0)
      return () => window.clearTimeout(deniedTimer)
    }
    const loadTimer = window.setTimeout(() => {
      if (isAdmin) loadEmployees()
    }, 0)

    const unsubscribe = subscribeDataSync(({ tag }) => {
      if (isAdmin && (tag === 'admin:workforce' || tag === 'admin:crm')) {
        loadEmployees()
      }
    })

    return () => {
      window.clearTimeout(loadTimer)
      unsubscribe()
    }
    // Authentication state determines when the first protected request may run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, isAdmin])

  const expiringSoon = useMemo(() => employees.filter((employee) => {
    const days = daysUntil(employee.contract_end_date)
    return ['ACTIVE', 'EXTENDED'].includes(employee.status) && days !== null && days <= 10
  }), [employees])

  const visibleEmployees = useMemo(() => {
    const query = search.trim().toLowerCase()
    return employees
      .filter((employee) => {
        if (activeTab === 'EXPIRING_SOON') return expiringSoon.some((item) => item.id === employee.id)
        return activeTab === 'ALL' || employee.status === activeTab
      })
      .filter((employee) => !query || employee.full_name?.toLowerCase().includes(query) || employee.personal_email?.toLowerCase().includes(query))
      .sort((left, right) => {
        if (sortBy === 'full_name') return (left.full_name || '').localeCompare(right.full_name || '')
        return dateOnly(left[sortBy]).localeCompare(dateOnly(right[sortBy]))
      })
  }, [activeTab, employees, expiringSoon, search, sortBy])

  const countForTab = (key) => key === 'ALL'
    ? employees.length
    : key === 'EXPIRING_SOON'
      ? expiringSoon.length
      : employees.filter((employee) => employee.status === key).length

  const [modalTab, setModalTab] = useState('DETAILS')
  const [milestones, setMilestones] = useState([])
  const [loadingMilestones, setLoadingMilestones] = useState(false)
  const [milestoneForm, setMilestoneForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    due_date: '',
    deliverable_url: '',
    review_notes: '',
    status: 'TODO',
  })
  const [editingMilestoneId, setEditingMilestoneId] = useState(null)
  const [showMilestoneForm, setShowMilestoneForm] = useState(false)

  const loadMilestones = async (employeeId) => {
    if (!employeeId || !user) return
    setLoadingMilestones(true)
    try {
      const data = await request(`/api/admin/workforce/milestones?employeeId=${employeeId}`)
      setMilestones(data.milestones || [])
    } catch (err) {
      console.error('Failed to load milestones', err)
    } finally {
      setLoadingMilestones(false)
    }
  }

  const startAddMilestone = () => {
    setMilestoneForm({
      title: '',
      description: '',
      priority: 'MEDIUM',
      due_date: new Date().toISOString().slice(0, 10),
      deliverable_url: '',
      review_notes: '',
      status: 'TODO',
    })
    setEditingMilestoneId(null)
    setShowMilestoneForm(true)
  }

  const startEditMilestone = (m) => {
    setMilestoneForm({
      title: m.title || '',
      description: m.description || '',
      priority: m.priority || 'MEDIUM',
      due_date: m.due_date ? m.due_date.slice(0, 10) : '',
      deliverable_url: m.deliverable_url || '',
      review_notes: m.review_notes || '',
      status: m.status || 'TODO',
    })
    setEditingMilestoneId(m.id)
    setShowMilestoneForm(true)
  }

  const cancelMilestoneForm = () => {
    setShowMilestoneForm(false)
    setEditingMilestoneId(null)
  }

  const saveMilestone = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      if (editingMilestoneId) {
        await request(`/api/admin/workforce/milestones/${editingMilestoneId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(milestoneForm),
        })
        showToast('Milestone updated successfully.')
      } else {
        await request('/api/admin/workforce/milestones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: form.id,
            ...milestoneForm,
          }),
        })
        showToast('New milestone assigned to employee.')
      }
      setShowMilestoneForm(false)
      setEditingMilestoneId(null)
      await loadMilestones(form.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const deleteMilestone = async (milestoneId) => {
    if (!window.confirm('Delete this milestone permanently?')) return
    setSubmitting(true)
    setError('')
    try {
      await request(`/api/admin/workforce/milestones/${milestoneId}`, {
        method: 'DELETE',
      })
      showToast('Milestone deleted.')
      await loadMilestones(form.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const updateMilestoneStatus = async (milestoneId, newStatus) => {
    setSubmitting(true)
    setError('')
    try {
      await request(`/api/admin/workforce/milestones/${milestoneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      showToast(`Milestone marked ${newStatus.replace('_', ' ')}.`)
      await loadMilestones(form.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const [credentials, setCredentials] = useState([])
  const [loadingCredentials, setLoadingCredentials] = useState(false)
  const [issuanceModal, setIssuanceModal] = useState(null)
  const [issuanceForm, setIssuanceForm] = useState({
    stream_or_track: '',
    start_date: '',
    end_date: '',
    recommendation_text: '',
  })

  const loadCredentials = async (employeeId) => {
    if (!employeeId || !user) return
    setLoadingCredentials(true)
    try {
      const data = await request(`/api/admin/workforce/credentials?employeeId=${employeeId}`)
      setCredentials(data.credentials || [])
    } catch (err) {
      console.error('Failed to load credentials', err)
    } finally {
      setLoadingCredentials(false)
    }
  }

  const openIssuance = (type) => {
    const defaultStream = form.department || 'Operations & Management'
    const defaultLor = `During their tenure at SkillBun, ${form.full_name} demonstrated exceptional dedication, professional excellence, and proactive collaboration within the ${form.department || 'Operations'} department as a ${form.designation || 'Intern'}. They consistently delivered high-quality contributions across all assigned milestones, showing deep problem-solving proficiency, proactive communication, and high ethical standards. I strongly recommend ${form.full_name} for future professional and academic pursuits.`

    setIssuanceForm({
      stream_or_track: form.department || (type === 'TRAINING' ? 'Professional Industry Training' : defaultStream),
      start_date: form.joining_date || '',
      end_date: form.contract_end_date || '',
      recommendation_text: defaultLor,
    })
    setIssuanceModal(type)
  }

  const closeIssuance = () => {
    setIssuanceModal(null)
  }

  const submitIssuance = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const data = await request('/api/certify/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cert_type: issuanceModal,
          employee_id: form.id,
          name: form.full_name,
          email: form.personal_email,
          ...issuanceForm,
        }),
      })
      showToast(`Credential issued successfully! Ref: ${data.certId}`)
      setIssuanceModal(null)
      await loadCredentials(form.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleRevocation = async (credId, isRevoked) => {
    const actionName = isRevoked ? 'reinstate' : 'revoke'
    if (!window.confirm(`Are you sure you want to ${actionName} this credential?`)) return
    setSubmitting(true)
    setError('')
    try {
      await request(`/api/admin/workforce/credentials/${credId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_revoked: !isRevoked }),
      })
      showToast(`Credential ${isRevoked ? 'reinstated' : 'revoked'} successfully.`)
      await loadCredentials(form.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, skip_offer_email: false })
    setCourseSelect('')
    setDeptSelect('')
    setDesigSelect('')
    setSameAddress(false)
    setModalTab('DETAILS')
    setShowMilestoneForm(false)
    setEditingMilestoneId(null)
    setMilestones([])
    setCredentials([])
    setIssuanceModal(null)
    setExtensionTarget(null)
    setError('')
    setModal('add')
  }

  const openExtendModal = (employee) => {
    setExtensionTarget(employee)
    setExtensionMonths('3')
    const initialNewDate = calculateExtensionDate(employee.contract_end_date, 3)
    setCustomExtensionDate(initialNewDate)
    setError('')
    setModal('extend')
  }

  const openEdit = (employee) => {
    setForm(formFromEmployee(employee))

    if (PRESET_COURSES.includes(employee.course_degree)) {
      setCourseSelect(employee.course_degree)
    } else if (employee.course_degree) {
      setCourseSelect('__OTHER__')
    } else {
      setCourseSelect('')
    }

    let activeDept = ''
    if (PRESET_DEPARTMENTS.includes(employee.department)) {
      activeDept = employee.department
      setDeptSelect(employee.department)
    } else if (employee.department) {
      activeDept = '__OTHER__'
      setDeptSelect('__OTHER__')
    } else {
      setDeptSelect('')
    }

    const activeList = getDesignationsFor(activeDept === '__OTHER__' ? '' : activeDept, employee.employment_type)
    if (activeList.includes(employee.designation)) {
      setDesigSelect(employee.designation)
    } else if (employee.designation) {
      setDesigSelect('__OTHER__')
    } else {
      setDesigSelect('')
    }

    setSameAddress(Boolean(employee.current_address && employee.permanent_address && employee.current_address.trim() === employee.permanent_address.trim()))
    setModalTab('DETAILS')
    setShowMilestoneForm(false)
    setEditingMilestoneId(null)
    setIssuanceModal(null)
    setError('')
    setModal('edit')
    loadMilestones(employee.id)
    loadCredentials(employee.id)
  }

  const closeModal = () => {
    if (!submitting) {
      if (pdfPreview?.url) {
        URL.revokeObjectURL(pdfPreview.url)
        setPdfPreview(null)
      }
      setModal(null)
      setActivationTarget(null)
      setEmployeeToDelete(null)
      setShowMilestoneForm(false)
      setEditingMilestoneId(null)
      setIssuanceModal(null)
    }
  }

  const openDeleteConfirm = (employee) => {
    setEmployeeToDelete(employee)
    setError('')
    setModal('confirm-delete')
  }

  const handleDeleteEmployee = async () => {
    if (!employeeToDelete || !user) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/workforce/employees/${employeeToDelete.id}?hard=true`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete employee record.')
      }
      setEmployees((prev) => prev.filter((e) => e.id !== employeeToDelete.id))
      setModal(null)
      const empName = employeeToDelete.full_name
      setEmployeeToDelete(null)
      showToast(`Employee "${empName}" and all associated credentials permanently deleted.`)
    } catch (err) {
      setError(err.message || 'Failed to delete employee.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCourseSelectChange = (event) => {
    const value = event.target.value
    setCourseSelect(value)
    let updatedCourse = value
    if (value === '__OTHER__') {
      if (PRESET_COURSES.includes(form.course_degree)) {
        updatedCourse = ''
      } else {
        updatedCourse = form.course_degree
      }
    }
    setForm((current) => ({ ...current, course_degree: updatedCourse }))
  }

  const handleEmploymentTypeChange = (event) => {
    const newType = event.target.value
    setForm((current) => ({ ...current, employment_type: newType }))
    const activeList = getDesignationsFor(deptSelect === '__OTHER__' ? '' : deptSelect, newType)
    if (desigSelect !== '__OTHER__') {
      if (activeList.includes(form.designation)) {
        setDesigSelect(form.designation)
      } else {
        setDesigSelect('')
        setForm((current) => ({ ...current, designation: '' }))
      }
    }
  }

  const handleDeptSelectChange = (event) => {
    const value = event.target.value
    setDeptSelect(value)
    let updatedDept = value
    if (value === '__OTHER__') {
      if (PRESET_DEPARTMENTS.includes(form.department)) {
        updatedDept = ''
      } else {
        updatedDept = form.department
      }
    }
    setForm((current) => ({ ...current, department: updatedDept }))

    const newAvailableDesigs = getDesignationsFor(value === '__OTHER__' ? '' : value, form.employment_type)
    if (desigSelect !== '__OTHER__') {
      if (newAvailableDesigs.includes(form.designation)) {
        setDesigSelect(form.designation)
      } else {
        setDesigSelect('')
        setForm((current) => ({ ...current, designation: '' }))
      }
    }
  }

  const handleDesigSelectChange = (event) => {
    const value = event.target.value
    setDesigSelect(value)
    const activeList = getDesignationsFor(deptSelect === '__OTHER__' ? '' : deptSelect, form.employment_type)
    if (value === '__OTHER__') {
      if (activeList.includes(form.designation)) {
        setForm((current) => ({ ...current, designation: '' }))
      }
    } else {
      setForm((current) => ({ ...current, designation: value }))
    }
  }

  const handleCurrentAddressChange = (event) => {
    const value = event.target.value
    setForm((current) => ({
      ...current,
      current_address: value,
      ...(sameAddress ? { permanent_address: value } : {}),
    }))
  }

  const handlePermanentAddressChange = (event) => {
    const value = event.target.value
    if (sameAddress && value !== form.current_address) {
      setSameAddress(false)
    }
    setForm((current) => ({ ...current, permanent_address: value }))
  }

  const handleSameAddressToggle = (event) => {
    const isChecked = event.target.checked
    setSameAddress(isChecked)
    if (isChecked) {
      setForm((current) => ({ ...current, permanent_address: current.current_address }))
    }
  }

  const applyTenureDuration = (months) => {
    const baseDate = form.joining_date || new Date().toISOString().slice(0, 10)
    const [y, m, d] = baseDate.split('-').map(Number)
    const target = new Date(y, m - 1 + months, d)
    const yyyy = target.getFullYear()
    const mm = String(target.getMonth() + 1).padStart(2, '0')
    const dd = String(target.getDate()).padStart(2, '0')
    const calculatedEndDate = `${yyyy}-${mm}-${dd}`

    setForm((current) => ({
      ...current,
      joining_date: current.joining_date || baseDate,
      contract_end_date: calculatedEndDate,
    }))
  }

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const updateCredential = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, credentials_data: { ...current.credentials_data, [name]: value } }))
  }

  const saveEmployee = async (event) => {
    event.preventDefault()
    if (modal === 'confirm-terminate') return
    setSubmitting(true)
    setError('')
    try {
      const isEdit = modal === 'edit'
      const resData = await request(isEdit ? `/api/admin/workforce/employees/${form.id}` : '/api/admin/workforce/employees', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(form, { includeStatus: isEdit })),
      })

      if (!isEdit && resData?.fallbackDownload) {
        setDispatchFallback(resData)
        setModal('dispatch-fallback')
        showToast('Candidate saved. Email dispatch failed, manual PDF ready.')
        await loadEmployees()
        return
      }

      setModal(null)
      if (isEdit) {
        showToast('Employee details updated.')
      } else if (resData?.skipOfferEmail) {
        showToast('Candidate saved (Offer email skipped for existing team member).')
      } else {
        showToast(resData?.message || 'Candidate added & Offer letter dispatched via email!')
      }
      await loadEmployees()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const changeStatus = async (employee, status) => {
    if (status === 'TERMINATED') {
      setForm(formFromEmployee(employee))
      setTerminationReasonCode('COMPLETED')
      setTerminationReason('')
      setGrantInternshipCert(false)
      setGrantTrainingCert(false)
      setGrantLor(false)
      setRevokeAccess(true)
      setSendTerminationEmail(true)
      setModal('confirm-terminate')
      return
    }
    if (status === 'EXTENDED') {
      openExtendModal(employee)
      return
    }
    if (status === 'ACTIVE') {
      openActivateModal(employee)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await request(`/api/admin/workforce/employees/${employee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      showToast(`Employee marked ${statusLabel(status)}.`)
      await loadEmployees()
    } catch (statusError) {
      setError(statusError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const confirmTermination = async () => {
    if (!user) return
    setSubmitting(true)
    setError('')
    try {
      const idToken = await user.getIdToken()
      const res = await fetch('/api/admin/workforce/terminate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          employeeId: form.id,
          reasonCode: terminationReasonCode,
          reason: terminationReason,
          grantInternshipCert,
          grantTrainingCert,
          grantLor,
          revokeAccess,
          sendEmail: sendTerminationEmail,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error?.message || data?.message || 'Failed to process offboarding.')
      }

      setModal(null)
      setTerminationReason('')
      showToast(data.message || 'Employment terminated and portal access revoked.')
      await loadEmployees()
    } catch (terminationError) {
      setError(terminationError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const downloadOfferPdf = async (employeeId) => {
    if (!user) return
    setSubmitting(true)
    setError('')
    try {
      const idToken = await user.getIdToken()
      const res = await fetch('/api/admin/workforce/pdf/offer?format=json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ employeeId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message || data?.message || 'Failed to generate offer letter PDF.')
      }
      downloadBase64Pdf(data.pdfBase64, data.filename)
      showToast(`Offer letter PDF (${data.referenceId}) downloaded.`)
      return true
    } catch (pdfErr) {
      setError(pdfErr.message)
      throw pdfErr
    } finally {
      setSubmitting(false)
    }
  }

  const downloadExtensionPdf = async (employeeId, newContractEndDate) => {
    if (!user) return
    setSubmitting(true)
    setError('')
    try {
      const idToken = await user.getIdToken()
      const res = await fetch('/api/admin/workforce/pdf/extension?format=json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ employeeId, new_contract_end_date: newContractEndDate }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message || data?.message || 'Failed to generate extension letter PDF.')
      }
      downloadBase64Pdf(data.pdfBase64, data.filename)
      showToast(`Extension letter PDF (${data.referenceId}) generated & downloaded.`)
      return true
    } catch (pdfErr) {
      setError(pdfErr.message)
      throw pdfErr
    } finally {
      setSubmitting(false)
    }
  }

  const openActivateModal = (employee) => {
    setActivationTarget(employee)
    setActivationCreds({
      work_email: employee.work_email || (employee.full_name ? `${employee.full_name.toLowerCase().replace(/[^a-z0-9]/g, '')}@skillbun.tech` : ''),
      password: '',
      access_notes: '',
    })
    setShowActivationPassword(false)
    setError('')
    if (employee.has_credentials) {
      setModal('confirm-activate')
    } else {
      setModal('activate-credentials')
    }
  }

  const confirmActivation = async ({ skipEmail = false, withFormCreds = false } = {}) => {
    if (!user || !activationTarget) return
    setSubmitting(true)
    setError('')
    try {
      const idToken = await user.getIdToken()
      const credentialsData = withFormCreds && (activationCreds.work_email || activationCreds.password)
        ? activationCreds
        : null

      const res = await fetch('/api/admin/workforce/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          employeeId: activationTarget.id,
          credentials_data: credentialsData,
          skipEmail,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message || data?.message || 'Failed to activate employee.')
      }

      setModal(null)
      setActivationTarget(null)
      showToast(data.message || 'Employee marked Active!')
      await loadEmployees()
    } catch (actErr) {
      setError(actErr.message)
    } finally {
      setSubmitting(false)
    }
  }

  const dispatchOfferLetter = async (employeeId, credentialsData = null) => {
    if (!user) return
    setSubmitting(true)
    setError('')
    try {
      const idToken = await user.getIdToken()
      const res = await fetch('/api/admin/workforce/offer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ employeeId, credentials_data: credentialsData }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && !data.fallbackDownload) {
        throw new Error(data?.error?.message || data?.message || 'Failed to dispatch offer letter.')
      }

      if (data.success) {
        setModal(null)
        showToast(`Offer letter (${data.referenceId}) generated & dispatched via email!`)
        await loadEmployees()
      } else if (data.fallbackDownload) {
        setDispatchFallback(data)
        setModal('dispatch-fallback')
        await loadEmployees()
      }
    } catch (dispatchErr) {
      setError(dispatchErr.message)
    } finally {
      setSubmitting(false)
    }
  }

  const dispatchExtensionLetter = async (employeeId, newContractEndDate) => {
    if (!user) return
    setSubmitting(true)
    setError('')
    try {
      const idToken = await user.getIdToken()
      const res = await fetch('/api/admin/workforce/extension', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          employeeId,
          new_contract_end_date: newContractEndDate,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && !data.fallbackDownload) {
        throw new Error(data?.error?.message || data?.message || 'Failed to dispatch extension letter.')
      }

      if (data.success) {
        setModal(null)
        showToast(`Extension letter (${data.referenceId}) generated & dispatched via email!`)
        await loadEmployees()
      } else if (data.fallbackDownload) {
        setDispatchFallback(data)
        setModal('dispatch-fallback')
        await loadEmployees()
      }
    } catch (dispatchErr) {
      setError(dispatchErr.message)
    } finally {
      setSubmitting(false)
    }
  }

  const openEmailPreview = async (type, employee, extraData = {}) => {
    if (!user) return
    setSubmitting(true)
    setError('')
    try {
      const idToken = await user.getIdToken()
      const res = await fetch('/api/admin/workforce/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          employeeId: employee?.id,
          employeeOverride: employee,
          type,
          ...extraData,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error?.message || data?.message || 'Failed to generate email preview.')
      }

      setEmailPreview({
        ...data,
        employee,
        extraData,
      })
      setModal('email-preview')
    } catch (previewErr) {
      setError(previewErr.message)
    } finally {
      setSubmitting(false)
    }
  }

  const openPdfPreview = async (type, employee, extraData = {}) => {
    if (!user) return
    setSubmitting(true)
    setError('')
    try {
      const idToken = await user.getIdToken()
      const endpoint = type === 'EXTENSION'
        ? '/api/admin/workforce/pdf/extension?format=json'
        : '/api/admin/workforce/pdf/offer?format=json'

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          employeeId: employee.id,
          new_contract_end_date: extraData.new_contract_end_date,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.pdfBase64) {
        throw new Error(data?.error?.message || data?.message || 'Failed to render PDF preview.')
      }

      const byteCharacters = atob(data.pdfBase64)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'application/pdf' })
      const blobUrl = URL.createObjectURL(blob)

      setPdfPreview({
        url: blobUrl,
        title: type === 'EXTENSION' ? 'Extension Letter PDF' : 'Internship Offer Letter PDF',
        filename: data.filename || 'SkillBun_Document.pdf',
        referenceId: data.referenceId,
      })
      setModal('pdf-preview')
    } catch (pdfErr) {
      setError(pdfErr.message)
    } finally {
      setSubmitting(false)
    }
  }

  const downloadBase64Pdf = (base64Content, filename) => {
    try {
      const success = downloadUnifiedBase64Pdf(base64Content, filename || 'Offer_Letter.pdf');
      if (success) {
        showToast('Generated PDF downloaded to device.');
      }
    } catch (downloadErr) {
      setError('Unable to download fallback PDF: ' + downloadErr.message);
    }
  }

  const actionsFor = (employee) => {
    const actions = []
    if (employee.status === 'OFFER_SENT') actions.push(['ACTIVE', 'Activate'])
    if (employee.status === 'ACTIVE') actions.push(['EXTENDED', 'Extend'])
    if (['ACTIVE', 'EXTENDED'].includes(employee.status)) actions.push(['COMPLETED', 'Complete'])
    if (['OFFER_SENT', 'ACTIVE', 'EXTENDED'].includes(employee.status)) actions.push(['TERMINATED', 'Terminate'])
    return actions
  }

  if (authLoading || checking || (!user && !toast)) {
    return <main className={styles.page}><div className={styles.loading}>Checking Workforce Hub access...</div></main>
  }

  if (!isAdmin) {
    return (
      <main className={styles.page}>
        <div style={{ maxWidth: '480px', margin: '10vh auto', padding: '2.5rem', background: 'var(--card-bg)', border: '1px solid #ef4444', borderRadius: '16px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
            <Icon name="shield" size={28} />
          </div>
          <h2 style={{ color: '#ef4444', marginBottom: '0.75rem' }}>403 — Unauthorized Access</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Signed in as <strong>{user?.email || 'Student'}</strong>. This section is restricted to authorized platform administrators.
          </p>
          <Link href="/dashboard" style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', padding: '0.6rem 1.25rem', borderRadius: '8px', textDecoration: 'none', fontWeight: '600' }}>
            ← Back to Student Dashboard
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <div className={styles.grid} aria-hidden="true" />
      <section className={styles.container} aria-labelledby="workforce-title">
        <header className={styles.header}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <p className={styles.eyebrow} style={{ margin: 0 }}>SkillBun Operations</p>
              <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>•</span>
              <Link href="/dashboard/console/admin" style={{ color: 'var(--green)', fontSize: '0.82rem', textDecoration: 'none', fontWeight: '700' }}>← Admin Hub</Link>
              <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>•</span>
              <Link href="/dashboard/console/admin/analytics" style={{ color: 'var(--muted)', fontSize: '0.82rem', textDecoration: 'none', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <Icon name="analytics" size={13} /> Analytics & CRM
              </Link>
            </div>
            <h1 id="workforce-title">Workforce Hub</h1>
            <p className={styles.subtitle}>Manage candidate details, employment status, and upcoming contract milestones.</p>
          </div>
          <button type="button" className={styles.primaryButton} onClick={openAdd}>
            <Icon name="plus" /> Add Candidate
          </button>
        </header>

        {expiringSoon.filter((employee) => daysUntil(employee.contract_end_date) <= 7).length > 0 && (
          <div className={styles.alertBanner} role="alert">
            <Icon name="alert" />
            <span><strong>Contract attention needed.</strong> {expiringSoon.filter((employee) => daysUntil(employee.contract_end_date) <= 7).length} active contract{expiringSoon.filter((employee) => daysUntil(employee.contract_end_date) <= 7).length === 1 ? '' : 's'} expire within 7 days.</span>
          </div>
        )}

        <div className={styles.toolbar}>
          <div className={styles.tabs} aria-label="Employee status filters">
            {STATUS_TABS.map((tab) => (
              <button key={tab.key} type="button" className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`} onClick={() => setActiveTab(tab.key)}>
                {tab.label}<span>{countForTab(tab.key)}</span>
              </button>
            ))}
          </div>
          <label className={styles.searchField}>
            <Icon name="search" />
            <span className={styles.srOnly}>Search employees</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" />
          </label>
          <label className={styles.sortField}>
            <span>Sort</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="full_name">Name</option>
              <option value="joining_date">Joining date</option>
              <option value="contract_end_date">Contract end date</option>
            </select>
          </label>
          <button type="button" className={styles.refreshButton} onClick={loadEmployees} disabled={loading} aria-label="Refresh employee list"><Icon name="refresh" /></button>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        <section className={styles.tableWrap} aria-label="Workforce employees">
          {loading ? <div className={styles.loading}>Loading employees...</div> : visibleEmployees.length === 0 ? (
            <div className={styles.empty}><strong>No employees found.</strong><span>Adjust the filters or add a new candidate to begin.</span></div>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Designation</th><th>Status</th><th>Tenure remaining</th><th><span className={styles.srOnly}>Actions</span></th></tr></thead>
              <tbody>{visibleEmployees.map((employee) => {
                const tenure = tenureMeta(employee)
                return <tr key={employee.id} onClick={() => openEdit(employee)} className={styles.employeeRow}>
                  <td data-label="Name"><strong>{employee.full_name}</strong><small>{employee.employment_type.replace('_', ' ')}</small></td>
                  <td data-label="Email">{employee.personal_email}</td>
                  <td data-label="Department">{employee.department}</td>
                  <td data-label="Designation">{employee.designation}</td>
                  <td data-label="Status"><span className={`${styles.status} ${styles[`status${employee.status}`] || ''}`}>{statusLabel(employee.status)}</span></td>
                  <td data-label="Tenure remaining">{tenure ? <span className={`${styles.tenure} ${styles[tenure.tone]}`}>{tenure.label}</span> : <span className={styles.muted}>--</span>}</td>
                  <td data-label="Actions" onClick={(event) => event.stopPropagation()}><div className={styles.actions}>
                    <button type="button" className={styles.iconButton} onClick={() => openEdit(employee)} aria-label={`Edit ${employee.full_name}`} title={`Edit ${employee.full_name}`}><Icon name="edit" /></button>
                    <button type="button" className={`${styles.iconButton} ${styles.deleteIconButton}`} onClick={() => openDeleteConfirm(employee)} aria-label={`Delete ${employee.full_name}`} title={`Delete ${employee.full_name} & Records`}><Icon name="trash" /></button>
                    {actionsFor(employee).map(([status, label]) => <button key={status} type="button" className={status === 'TERMINATED' ? styles.terminateButton : styles.actionButton} onClick={() => changeStatus(employee, status)} disabled={submitting}>{label}</button>)}
                  </div></td>
                </tr>
              })}</tbody>
            </table>
          )}
        </section>
        {pagination.has_more && !loading && (
          <div className={styles.loadMoreWrap}>
            <button type="button" className={styles.secondaryButton} onClick={() => loadEmployees({ append: true, pageToken: pagination.next_page_token })}>Load more employees</button>
          </div>
        )}
      </section>

      {modal && <div className={styles.backdrop} role="presentation" onMouseDown={closeModal}>
        <section
          className={`${styles.modal} ${modal === 'confirm-terminate' || modal === 'confirm-delete' ? styles.confirmModal : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          {modal === 'confirm-terminate' && (
            <div className={styles.modalContent} style={{ padding: '1.4rem', maxWidth: '620px', width: '100%' }}>
              <div className={styles.modalHeader} style={{ padding: 0, borderBottom: 'none', marginBottom: '0.85rem' }}>
                <div>
                  <p className={styles.eyebrow} style={{ color: 'var(--accent)' }}>Offboarding & Document Issuance</p>
                  <h2 id="modal-title" style={{ fontSize: '1.25rem' }}>Conclude Tenure / Offboard Candidate</h2>
                </div>
                <button type="button" className={styles.iconButton} onClick={closeModal} aria-label="Close dialog"><Icon name="close" /></button>
              </div>
              <p className={styles.confirmText} style={{ marginBottom: '1rem', lineHeight: '1.5' }}>
                Process official tenure offboarding for <strong>{form.full_name}</strong>. Granted credentials will be permanently preserved in the public <strong>SkillBun Alumni Vault</strong>.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginBottom: '1.2rem' }}>
                <label className={styles.field} style={{ margin: 0 }}>
                  <span className={styles.fieldLabel}>Offboarding / Separation Reason</span>
                  <select
                    value={terminationReasonCode}
                    onChange={(e) => setTerminationReasonCode(e.target.value)}
                    className={styles.select}
                  >
                    <option value="COMPLETED">Tenure Completed Successfully (Standard Graduation)</option>
                    <option value="ACADEMIC_LEAVE">Academic Commitments & College Exams</option>
                    <option value="VOLUNTARY_RESIGNATION">Voluntary Resignation / Personal Career Move</option>
                    <option value="MUTUAL_SEPARATION">Mutual Separation Agreement</option>
                    <option value="PERFORMANCE_FIT">Role Re-alignment / Performance Fit</option>
                    <option value="POLICY_DISCONTINUATION">Administrative Action / Policy Discontinuation</option>
                    <option value="CUSTOM">Custom Specified Reason</option>
                  </select>
                </label>

                <label className={styles.field} style={{ margin: 0 }}>
                  <span className={styles.fieldLabel}>Administrative Note / Custom Reason (Optional)</span>
                  <input
                    type="text"
                    value={terminationReason}
                    onChange={(e) => setTerminationReason(e.target.value)}
                    placeholder="e.g. Completed all sprints with distinction / Returning to campus"
                    className={styles.input}
                  />
                </label>

                {/* Credential Granting Options */}
                <div style={{ background: 'var(--surface)', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Verified Document Grants (Preserved in Alumni Vault)
                  </span>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.84rem', cursor: 'pointer', color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      checked={grantInternshipCert}
                      onChange={(e) => setGrantInternshipCert(e.target.checked)}
                      style={{ accentColor: 'var(--green)', width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Icon name="certificate" size={16} /> Issue <strong>Certificate of Internship Completion (INT-REC)</strong>
                    </span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.84rem', cursor: 'pointer', color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      checked={grantTrainingCert}
                      onChange={(e) => setGrantTrainingCert(e.target.checked)}
                      style={{ accentColor: 'var(--green)', width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Icon name="book" size={16} /> Issue <strong>Practical Industry Training Certificate (TRN-EXP)</strong>
                    </span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.84rem', cursor: 'pointer', color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      checked={grantLor}
                      onChange={(e) => setGrantLor(e.target.checked)}
                      style={{ accentColor: 'var(--green)', width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Icon name="award" size={16} /> Issue <strong>Official Letter of Recommendation (CORP-LOR)</strong>
                    </span>
                  </label>
                </div>

                {/* Access & Email Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.84rem', cursor: 'pointer', color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      checked={revokeAccess}
                      onChange={(e) => setRevokeAccess(e.target.checked)}
                      style={{ accentColor: 'var(--danger)', width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Icon name="lock" size={16} /> Revoke workspace credentials & internal dashboard access
                    </span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.84rem', cursor: 'pointer', color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      checked={sendTerminationEmail}
                      onChange={(e) => setSendTerminationEmail(e.target.checked)}
                      style={{ accentColor: 'var(--green)', width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Icon name="mail" size={16} /> Send formal Offboarding & Documents email to <strong>{form.personal_email || 'candidate'}</strong>
                    </span>
                  </label>
                </div>
              </div>

              {error && <div className={styles.error} role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

              <div className={styles.modalActions} style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <button type="button" className={styles.secondaryButton} onClick={closeModal}>Cancel</button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    const granted = []
                    if (grantInternshipCert) granted.push('Certificate of Internship Completion (INT-REC)')
                    if (grantTrainingCert) granted.push('Practical Industry Training Certificate (TRN-EXP)')
                    if (grantLor) granted.push('Official Letter of Recommendation (CORP-LOR)')
                    openEmailPreview('TERMINATION_EMAIL', form, {
                      reasonCode: terminationReasonCode,
                      reason: terminationReason,
                      grantedCredentials: granted,
                    })
                  }}
                  disabled={submitting}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Icon name="eye" size={15} /> Preview Notice Email
                </button>
                <button
                  type="button"
                  className={['COMPLETED', 'ACADEMIC_LEAVE', 'VOLUNTARY_RESIGNATION'].includes(terminationReasonCode) ? styles.primaryButton : styles.terminateButton}
                  onClick={confirmTermination}
                  disabled={submitting}
                  style={{ fontWeight: 800, padding: '0.45rem 1.15rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {submitting ? (
                    'Processing...'
                  ) : ['COMPLETED', 'ACADEMIC_LEAVE', 'VOLUNTARY_RESIGNATION'].includes(terminationReasonCode) ? (
                    <>
                      <Icon name="check" size={15} /> Conclude & Grant Documents
                    </>
                  ) : (
                    <>
                      <Icon name="alert" size={15} /> Confirm Offboarding
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {modal === 'confirm-delete' && employeeToDelete && (
            <div className={styles.modalContent} style={{ padding: '1.4rem', maxWidth: '540px', width: '100%' }}>
              <div className={styles.modalHeader} style={{ padding: 0, borderBottom: 'none', marginBottom: '0.85rem' }}>
                <div>
                  <p className={styles.eyebrow} style={{ color: 'var(--danger)' }}>Permanent Deletion</p>
                  <h2 id="modal-title" style={{ fontSize: '1.25rem' }}>Delete Employee & Records</h2>
                </div>
                <button type="button" className={styles.iconButton} onClick={closeModal} aria-label="Close dialog"><Icon name="close" /></button>
              </div>
              <p className={styles.confirmText} style={{ marginBottom: '1rem', lineHeight: '1.5' }}>
                Are you sure you want to permanently delete <strong>{employeeToDelete.full_name}</strong> ({employeeToDelete.personal_email})?
              </p>
              <div style={{ padding: '0.85rem 1rem', background: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)', borderRadius: '10px', fontSize: '0.82rem', color: 'var(--text)', marginBottom: '1.2rem', lineHeight: '1.6' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--danger)', fontWeight: 700 }}>
                  <Icon name="alert" size={15} /> Permanent Cascade Deletion:
                </span>
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
                  <li>Employee profile & tenure record</li>
                  <li>All verified certificates (Internship, Training, LOR)</li>
                  <li>All formal workforce documents (Offer & Extension letters)</li>
                  <li>All assigned milestone deliverables</li>
                </ul>
              </div>
              {error && <div className={styles.error} role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}
              <div className={styles.modalActions} style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', gap: '0.65rem' }}>
                <button type="button" className={styles.secondaryButton} onClick={closeModal} disabled={submitting}>Cancel</button>
                <button type="button" className={styles.dangerButton} onClick={handleDeleteEmployee} disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  {submitting ? 'Deleting...' : (
                    <>
                      <Icon name="trash" size={15} /> Delete Employee & All Records
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {modal === 'dispatch-fallback' && dispatchFallback && (
            <div className={styles.modalContent} style={{ padding: '1.35rem' }}>
              <div className={styles.modalHeader} style={{ padding: 0, borderBottom: 'none', marginBottom: '0.85rem' }}>
                <div>
                  <p className={styles.eyebrow}>SMTP Dispatch Notice</p>
                  <h2 id="modal-title">Manual Dispatch Ready</h2>
                </div>
                <button type="button" className={styles.iconButton} onClick={closeModal} aria-label="Close dialog"><Icon name="close" /></button>
              </div>
              <p className={styles.confirmText}>
                The 4-page formal Offer Letter PDF (Ref: <strong>{dispatchFallback.referenceId}</strong>) was generated successfully.
                However, automated Zoho SMTP delivery failed. You can download the generated PDF below and email the candidate manually:
              </p>
              <div className={styles.alertBanner} role="alert" style={{ margin: '1rem 0' }}>
                <span>{dispatchFallback.error}</span>
              </div>
              <div className={styles.boxDark} style={{ margin: '1rem 0', fontSize: '0.86rem', lineHeight: '1.6' }}>
                <p style={{ margin: '0 0 0.35rem 0' }}><strong>Recipient:</strong> {dispatchFallback.recipient}</p>
                <p style={{ margin: 0 }}><strong>Subject:</strong> {dispatchFallback.subject}</p>
              </div>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => downloadBase64Pdf(dispatchFallback.pdfBase64, dispatchFallback.filename)}
                >
                  Download Generated PDF
                </button>
                <button type="button" className={styles.secondaryButton} onClick={closeModal}>Close</button>
              </div>
            </div>
          )}

          {(modal === 'add' || modal === 'edit') && (
            <div className={styles.modalContent}>
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.eyebrow}>{modal === 'add' ? 'New workforce record' : 'Employee record'}</p>
                  <h2 id="modal-title">{modal === 'add' ? 'Add Candidate' : `Edit ${form.full_name}`}</h2>
                </div>
                <button type="button" className={styles.iconButton} onClick={closeModal} aria-label="Close dialog"><Icon name="close" /></button>
              </div>
              {modal === 'edit' && (
                <div className={styles.modalTabs}>
                  <button
                    type="button"
                    className={`${styles.modalTab} ${modalTab === 'DETAILS' ? styles.modalTabActive : ''}`}
                    onClick={() => setModalTab('DETAILS')}
                  >
                    Candidate Details
                  </button>
                  <button
                    type="button"
                    className={`${styles.modalTab} ${modalTab === 'MILESTONES' ? styles.modalTabActive : ''}`}
                    onClick={() => setModalTab('MILESTONES')}
                  >
                    Sprint Milestones ({milestones.length})
                  </button>
                  <button
                    type="button"
                    className={`${styles.modalTab} ${modalTab === 'CREDENTIALS' ? styles.modalTabActive : ''}`}
                    onClick={() => setModalTab('CREDENTIALS')}
                  >
                    Credentials & LOR ({credentials.length})
                  </button>
                </div>
              )}

              <div className={styles.modalBody}>
                {modalTab === 'DETAILS' && (
                  <form onSubmit={saveEmployee}>
                    <div className={styles.formGrid}>
                      <label>Salutation<select name="salutation" value={form.salutation} onChange={updateField}><option>Mr.</option><option>Ms.</option></select></label>
                      <label>Full name<input name="full_name" value={form.full_name} onChange={updateField} required /></label>
                      <label>Parent name<input name="parent_name" value={form.parent_name} onChange={updateField} required /></label>
                      <label>Personal email<input name="personal_email" type="email" value={form.personal_email} onChange={updateField} required /></label>
                      <label>Phone<input name="phone" value={form.phone} onChange={updateField} required /></label>
                      <label>Employment type<select name="employment_type" value={form.employment_type} onChange={handleEmploymentTypeChange}><option value="INTERN">Intern</option><option value="FULL_TIME">Full time</option><option value="CONTRACTOR">Contractor</option></select></label>

                      <div className={styles.fieldGroup}>
                        <label>
                          Course / degree
                          <select value={courseSelect} onChange={handleCourseSelectChange} required>
                            <option value="" disabled>Select course / degree...</option>
                            {PRESET_COURSES.map((course) => (
                              <option key={course} value={course}>{course}</option>
                            ))}
                            <option value="__OTHER__">Other (Please specify)</option>
                          </select>
                        </label>
                        {courseSelect === '__OTHER__' && (
                          <input
                            name="course_degree"
                            value={form.course_degree}
                            onChange={updateField}
                            placeholder="Please specify course / degree qualification"
                            required
                            className={styles.specifyInput}
                            autoFocus
                          />
                        )}
                      </div>

                      <label>College name<input name="college_name" value={form.college_name} onChange={updateField} required /></label>
                      
                      <div className={styles.fieldGroup}>
                        <label>
                          Department
                          <select value={deptSelect} onChange={handleDeptSelectChange} required>
                            <option value="" disabled>Select department...</option>
                            {PRESET_DEPARTMENTS.map((dept) => (
                              <option key={dept} value={dept}>{dept}</option>
                            ))}
                            <option value="__OTHER__">Other (Please specify)</option>
                          </select>
                        </label>
                        {deptSelect === '__OTHER__' && (
                          <input
                            name="department"
                            value={form.department}
                            onChange={updateField}
                            placeholder="Please specify department name"
                            required
                            className={styles.specifyInput}
                            autoFocus
                          />
                        )}
                      </div>

                      <div className={styles.fieldGroup}>
                        <label>
                          Designation ({form.employment_type === 'INTERN' ? 'Intern Roles' : 'Employee Roles'}
                          {deptSelect && deptSelect !== '__OTHER__' ? ` • ${deptSelect}` : ''})
                          <select value={desigSelect} onChange={handleDesigSelectChange} required>
                            <option value="" disabled>
                              {deptSelect && deptSelect !== '__OTHER__' ? `Select ${deptSelect} role...` : 'Select designation...'}
                            </option>
                            {getDesignationsFor(deptSelect === '__OTHER__' ? '' : deptSelect, form.employment_type).map((desig) => (
                              <option key={desig} value={desig}>{desig}</option>
                            ))}
                            <option value="__OTHER__">Other (Please specify)</option>
                          </select>
                        </label>
                        {desigSelect === '__OTHER__' && (
                          <input
                            name="designation"
                            value={form.designation}
                            onChange={updateField}
                            placeholder="Please specify designation title"
                            required
                            className={styles.specifyInput}
                            autoFocus
                          />
                        )}
                      </div>

                      <label>
                        Joining date
                        <input
                          name="joining_date"
                          type="date"
                          value={form.joining_date}
                          onChange={updateField}
                          required
                        />
                      </label>

                      <div className={styles.fieldGroup}>
                        <div className={styles.fieldHeaderFlex}>
                          <label style={{ margin: 0 }}>Contract end date</label>
                          <div className={styles.durationPills} title="Auto-fill end date from joining date">
                            <button
                              type="button"
                              className={styles.durationPill}
                              onClick={() => applyTenureDuration(1)}
                            >
                              1M
                            </button>
                            <button
                              type="button"
                              className={styles.durationPill}
                              onClick={() => applyTenureDuration(2)}
                            >
                              2M
                            </button>
                            <button
                              type="button"
                              className={styles.durationPill}
                              onClick={() => applyTenureDuration(3)}
                            >
                              3M
                            </button>
                            <button
                              type="button"
                              className={styles.durationPill}
                              onClick={() => applyTenureDuration(6)}
                            >
                              6M
                            </button>
                            <button
                              type="button"
                              className={styles.durationPill}
                              onClick={() => applyTenureDuration(12)}
                            >
                              1Yr
                            </button>
                          </div>
                        </div>
                        <input
                          name="contract_end_date"
                          type="date"
                          value={form.contract_end_date}
                          onChange={updateField}
                          required
                        />
                      </div>
                      <label>Stipend amount (INR)<input name="stipend_amount" type="number" min="0" step="0.01" value={form.stipend_amount} onChange={updateField} required /></label>
                      <label>Work email <span className={styles.optional}>Optional</span><input name="work_email" type="email" value={form.work_email} onChange={updateField} /></label>
                      <label className={styles.fullWidth}>
                        Current address
                        <textarea
                          name="current_address"
                          value={form.current_address}
                          onChange={handleCurrentAddressChange}
                          required
                          rows="2"
                          placeholder="Current residential / local address"
                        />
                      </label>
                      
                      <div className={styles.fullWidth}>
                        <div className={styles.addressHeader}>
                          <label style={{ margin: 0 }}>Permanent address</label>
                          <label className={styles.checkboxLabel}>
                            <input
                              type="checkbox"
                              checked={sameAddress}
                              onChange={handleSameAddressToggle}
                            />
                            <span>Same as current address</span>
                          </label>
                        </div>
                        <textarea
                          name="permanent_address"
                          value={form.permanent_address}
                          onChange={handlePermanentAddressChange}
                          required
                          rows="2"
                          placeholder="Permanent home address"
                        />
                      </div>
                    </div>
                <fieldset className={styles.credentials}><legend>Zoho credentials <span>optional and encrypted on save</span></legend><div className={styles.formGrid}>
                  <label>Zoho work email<input name="work_email" type="email" value={form.credentials_data.work_email} onChange={updateCredential} /></label>
                  <label>Zoho password<input name="password" type="password" value={form.credentials_data.password} onChange={updateCredential} autoComplete="new-password" /></label>
                  <label className={styles.fullWidth}>Access notes<textarea name="access_notes" value={form.credentials_data.access_notes} onChange={updateCredential} rows="2" /></label>
                </div></fieldset>

                {modal === 'add' && (
                  <div style={{ marginTop: '0.85rem', marginBottom: '0.5rem' }}>
                    <label
                      className={styles.checkboxLabel}
                      style={{
                        background: 'color-mix(in srgb, var(--surface) 92%, var(--green))',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid color-mix(in srgb, var(--border) 70%, var(--green))',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        name="skip_offer_email"
                        checked={Boolean(form.skip_offer_email)}
                        onChange={(e) => setForm((prev) => ({ ...prev, skip_offer_email: e.target.checked }))}
                        style={{ marginTop: '3px', accentColor: 'var(--green)' }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--foreground)' }}>
                          Existing team member (Skip offer letter email dispatch)
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '2px', lineHeight: 1.4 }}>
                          If checked, no offer email will be sent to the candidate. Only their profile and credentials data will be saved directly into the database.
                        </div>
                      </div>
                    </label>
                  </div>
                )}

                {error && <div className={styles.error} role="alert">{error}</div>}
                <div className={styles.modalActions} style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                  {modal === 'edit' && (
                    <>
                      {form.status === 'EXTENDED' ? (
                        <>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => openEmailPreview('EXTENSION_EMAIL', form, { new_contract_end_date: form.contract_end_date })}
                            disabled={submitting}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                          >
                            <Icon name="eye" size={15} /> Preview Email
                          </button>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => openPdfPreview('EXTENSION', form, { new_contract_end_date: form.contract_end_date })}
                            disabled={submitting}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                          >
                            <Icon name="eye" size={15} /> Preview PDF
                          </button>
                          <button
                            type="button"
                            className={styles.dispatchButton}
                            onClick={() => dispatchExtensionLetter(form.id, form.contract_end_date)}
                            disabled={submitting}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                          >
                            <Icon name="mail" size={15} /> Dispatch Extension via Email
                          </button>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => openExtendModal(form)}
                            disabled={submitting}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                          >
                            <Icon name="calendar" size={15} /> Extend Tenure / PDF
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => openEmailPreview('OFFER_EMAIL', form)}
                            disabled={submitting}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                          >
                            <Icon name="eye" size={15} /> Preview Email
                          </button>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => openPdfPreview('OFFER', form)}
                            disabled={submitting}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                          >
                            <Icon name="eye" size={15} /> Preview PDF
                          </button>
                          <button
                            type="button"
                            className={styles.dispatchButton}
                            onClick={() => dispatchOfferLetter(form.id, form.credentials_data)}
                            disabled={submitting}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                          >
                            <Icon name="mail" size={15} /> Dispatch Offer via Email
                          </button>
                          {form.status === 'ACTIVE' && (
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => openExtendModal(form)}
                              disabled={submitting}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                              <Icon name="calendar" size={15} /> Extend Tenure / PDF
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                  <button type="button" className={styles.secondaryButton} onClick={closeModal}>Cancel</button>
                  <button type="submit" className={styles.primaryButton} disabled={submitting}>
                    {submitting
                      ? modal === 'add'
                        ? form.skip_offer_email
                          ? 'Adding Candidate...'
                          : 'Sending & Adding...'
                        : 'Saving...'
                      : modal === 'add'
                        ? form.skip_offer_email
                          ? 'Add Candidate'
                          : 'Send Offer Letter & Add Candidate'
                        : 'Save changes'}
                  </button>
                </div>
              </form>
            )}

            {modalTab === 'MILESTONES' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <p className={styles.eyebrow}>Sprint Deliverables</p>
                    <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Assigned Milestones</h3>
                  </div>
                  {!showMilestoneForm && (
                    <button type="button" className={styles.primaryButton} onClick={startAddMilestone}>
                      <Icon name="plus" /> Add Milestone
                    </button>
                  )}
                </div>

                {showMilestoneForm && (
                  <form onSubmit={saveMilestone} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface)', marginBottom: '1.25rem' }}>
                    <h4 style={{ margin: '0 0 0.85rem 0', fontSize: '0.95rem' }}>{editingMilestoneId ? 'Edit Milestone' : 'New Sprint Milestone'}</h4>
                    <div className={styles.formGrid}>
                      <label className={styles.fullWidth}>
                        Title
                        <input
                          value={milestoneForm.title}
                          onChange={(e) => setMilestoneForm({ ...milestoneForm, title: e.target.value })}
                          placeholder="e.g. Next.js API Authentication & Unit Tests"
                          required
                        />
                      </label>
                      <label>
                        Priority
                        <select
                          value={milestoneForm.priority}
                          onChange={(e) => setMilestoneForm({ ...milestoneForm, priority: e.target.value })}
                        >
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                          <option value="URGENT">Urgent</option>
                        </select>
                      </label>
                      <label>
                        Status
                        <select
                          value={milestoneForm.status}
                          onChange={(e) => setMilestoneForm({ ...milestoneForm, status: e.target.value })}
                        >
                          <option value="TODO">To Do</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="UNDER_REVIEW">Under Review</option>
                          <option value="COMPLETED">Completed</option>
                        </select>
                      </label>
                      <label>
                        Due Date
                        <input
                          type="date"
                          value={milestoneForm.due_date}
                          onChange={(e) => setMilestoneForm({ ...milestoneForm, due_date: e.target.value })}
                          required
                        />
                      </label>
                      <label>
                        Deliverable URL
                        <input
                          type="url"
                          value={milestoneForm.deliverable_url}
                          onChange={(e) => setMilestoneForm({ ...milestoneForm, deliverable_url: e.target.value })}
                          placeholder="https://github.com/..."
                        />
                      </label>
                      <label className={styles.fullWidth}>
                        Description
                        <textarea
                          value={milestoneForm.description}
                          onChange={(e) => setMilestoneForm({ ...milestoneForm, description: e.target.value })}
                          rows="2"
                          placeholder="Brief description of requirements..."
                        />
                      </label>
                      <label className={styles.fullWidth}>
                        Admin Review Notes
                        <textarea
                          value={milestoneForm.review_notes}
                          onChange={(e) => setMilestoneForm({ ...milestoneForm, review_notes: e.target.value })}
                          rows="2"
                          placeholder="Feedback or acceptance criteria..."
                        />
                      </label>
                    </div>
                    {error && <div className={styles.error} role="alert" style={{ marginTop: '0.85rem' }}>{error}</div>}
                    <div className={styles.modalActions} style={{ marginTop: '0.85rem' }}>
                      <button type="button" className={styles.secondaryButton} onClick={cancelMilestoneForm}>Cancel</button>
                      <button type="submit" className={styles.primaryButton} disabled={submitting}>
                        {submitting ? 'Saving...' : editingMilestoneId ? 'Update Milestone' : 'Assign Milestone'}
                      </button>
                    </div>
                  </form>
                )}

                {loadingMilestones ? (
                  <div className={styles.loading}>Loading milestones...</div>
                ) : milestones.length === 0 ? (
                  <div className={styles.empty}>
                    <strong>No sprint milestones yet.</strong>
                    <span>Assign core tasks and deliverables to track intern sprint progress.</span>
                  </div>
                ) : (
                  <div className={styles.milestoneList}>
                    {milestones.map((m) => {
                      const isOverdue = m.due_date && new Date(`${m.due_date}T00:00:00`) < new Date(new Date().setHours(0,0,0,0)) && m.status !== 'COMPLETED'
                      return (
                        <div key={m.id} className={`${styles.milestoneCard} ${isOverdue ? styles.milestoneCardOverdue : ''}`}>
                          <div className={styles.milestoneHeader}>
                            <div>
                              <strong>{m.title}</strong>
                              {m.description && <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>{m.description}</p>}
                            </div>
                            <div className={styles.milestoneBadges}>
                              <span className={`${styles.priorityBadge} ${styles[`priority${m.priority}`] || ''}`}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.priority === 'URGENT' ? '#ef4444' : m.priority === 'HIGH' ? '#f59e0b' : m.priority === 'MEDIUM' ? '#3b82f6' : '#9ca3af', display: 'inline-block', marginRight: '0.4rem' }} />
                                {m.priority}
                              </span>
                              <select
                                value={m.status}
                                onChange={(e) => updateMilestoneStatus(m.id, e.target.value)}
                                className={styles.status}
                                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', cursor: 'pointer', outline: 'none' }}
                              >
                                <option value="TODO">To Do</option>
                                <option value="IN_PROGRESS">In Progress</option>
                                <option value="UNDER_REVIEW">Under Review</option>
                                <option value="COMPLETED">Completed</option>
                              </select>
                            </div>
                          </div>
                          <div className={styles.milestoneMeta}>
                            <span>Due: <strong style={{ color: isOverdue ? 'var(--danger)' : 'inherit' }}>{m.due_date || 'N/A'}{isOverdue ? ' (Overdue)' : ''}</strong></span>
                            {m.deliverable_url ? (
                              <a href={m.deliverable_url} target="_blank" rel="noopener noreferrer" className={styles.deliverableLink} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Icon name="link" size={14} /> Open Deliverable
                              </a>
                            ) : (
                              <span>No deliverable URL</span>
                            )}
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.35rem' }}>
                              <button type="button" className={styles.actionButton} onClick={() => startEditMilestone(m)}>Edit</button>
                              <button type="button" className={styles.terminateButton} onClick={() => deleteMilestone(m.id)}>Delete</button>
                            </div>
                          </div>
                          {m.review_notes && (
                            <div className={styles.reviewNotesBox}>
                              <strong>Review Notes:</strong> {m.review_notes}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className={styles.modalActions}>
                  <button type="button" className={styles.secondaryButton} onClick={closeModal}>Close</button>
                </div>
              </div>
            )}

            {modalTab === 'CREDENTIALS' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <p className={styles.eyebrow}>Verified Digital Credentials</p>
                    <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Issued Credentials & LOR</h3>
                  </div>
                </div>

                <div className={styles.issuanceButtons}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => openIssuance('INTERNSHIP')}
                    disabled={form.status !== 'COMPLETED'}
                    title={form.status !== 'COMPLETED' ? 'Internship certificate requires employee status to be COMPLETED.' : ''}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    <Icon name="certificate" size={16} /> Issue Certificate of Internship
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    style={{ background: '#7c3aed', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    onClick={() => openIssuance('TRAINING')}
                    disabled={!['ACTIVE', 'EXTENDED', 'COMPLETED'].includes(form.status)}
                    title={!['ACTIVE', 'EXTENDED', 'COMPLETED'].includes(form.status) ? 'Training certificate requires ACTIVE, EXTENDED, or COMPLETED status.' : ''}
                  >
                    <Icon name="book" size={16} /> Issue Certificate of Training
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    style={{ background: '#ca8a04', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    onClick={() => openIssuance('LOR')}
                    disabled={form.status !== 'COMPLETED'}
                    title={form.status !== 'COMPLETED' ? 'Letter of Recommendation requires employee status to be COMPLETED.' : ''}
                  >
                    <Icon name="award" size={16} /> Issue Letter of Recommendation (LOR)
                  </button>
                </div>

                {issuanceModal && (
                  <form onSubmit={submitIssuance} style={{ padding: '1.1rem', border: '1px solid var(--green)', borderRadius: '12px', background: 'var(--surface)', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Icon name={issuanceModal === 'INTERNSHIP' ? 'certificate' : issuanceModal === 'TRAINING' ? 'book' : 'award'} size={18} />
                        {issuanceModal === 'INTERNSHIP' ? 'Issue Certificate of Internship' : issuanceModal === 'TRAINING' ? 'Issue Certificate of Training' : 'Issue Letter of Recommendation'}
                      </h4>
                      <button type="button" className={styles.iconButton} onClick={closeIssuance} aria-label="Close issuance form">
                        <Icon name="close" />
                      </button>
                    </div>

                    <div className={styles.formGrid}>
                      <label>
                        Candidate Name
                        <input value={form.full_name} disabled style={{ opacity: 0.75 }} />
                      </label>
                      <label>
                        Personal Email
                        <input value={form.personal_email} disabled style={{ opacity: 0.75 }} />
                      </label>
                      <label className={styles.fullWidth}>
                        Stream / Track Title
                        <input
                          value={issuanceForm.stream_or_track}
                          onChange={(e) => setIssuanceForm({ ...issuanceForm, stream_or_track: e.target.value })}
                          placeholder="e.g. Full-Stack Web Development & Cloud Systems"
                          required
                        />
                      </label>
                      <label>
                        Start Date
                        <input
                          type="date"
                          value={issuanceForm.start_date}
                          onChange={(e) => setIssuanceForm({ ...issuanceForm, start_date: e.target.value })}
                          required
                        />
                      </label>
                      <label>
                        End Date
                        <input
                          type="date"
                          value={issuanceForm.end_date}
                          onChange={(e) => setIssuanceForm({ ...issuanceForm, end_date: e.target.value })}
                          required
                        />
                      </label>
                      {issuanceModal === 'LOR' && (
                        <label className={styles.fullWidth}>
                          Letter of Recommendation Text (Editable Boilerplate)
                          <textarea
                            value={issuanceForm.recommendation_text}
                            onChange={(e) => setIssuanceForm({ ...issuanceForm, recommendation_text: e.target.value })}
                            rows="5"
                            required
                          />
                        </label>
                      )}
                    </div>
                    {error && <div className={styles.error} role="alert" style={{ marginTop: '0.85rem' }}>{error}</div>}
                    <div className={styles.modalActions} style={{ marginTop: '0.85rem' }}>
                      <button type="button" className={styles.secondaryButton} onClick={closeIssuance}>Cancel</button>
                      <button type="submit" className={styles.primaryButton} disabled={submitting}>
                        {submitting ? 'Minting Credential...' : `Mint & Issue ${issuanceModal}`}
                      </button>
                    </div>
                  </form>
                )}

                {loadingCredentials ? (
                  <div className={styles.loading}>Loading credentials...</div>
                ) : credentials.length === 0 ? (
                  <div className={styles.empty}>
                    <strong>No credentials issued yet.</strong>
                    <span>Use the buttons above to issue verified Internship, Training, or LOR credentials.</span>
                  </div>
                ) : (
                  <div>
                    {credentials.map((cred) => (
                      <div key={cred.id} className={`${styles.credentialCard} ${cred.is_revoked ? styles.credentialCardRevoked : ''}`}>
                        <div className={styles.credentialHeader}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span className={`${styles.certBadge} ${styles[`cert${cred.cert_type}`] || ''}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
                              {cred.cert_type === 'INTERNSHIP' ? (
                                <Icon name="certificate" size={13} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
                              ) : cred.cert_type === 'TRAINING' ? (
                                <Icon name="book" size={13} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
                              ) : cred.cert_type === 'LOR' ? (
                                <Icon name="award" size={13} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
                              ) : (
                                <Icon name="shield" size={13} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
                              )}
                              {cred.cert_type}
                            </span>
                            <span className={cred.is_revoked ? styles.revokedBadge : styles.activeBadge}>
                              {cred.is_revoked ? 'Revoked' : 'Active'}
                            </span>
                            <strong style={{ fontSize: '0.88rem' }}>{cred.id}</strong>
                          </div>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <Link
                              href={`/certificate/${encodeURIComponent(cred.id)}`}
                              target="_blank"
                              className={styles.actionButton}
                              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                              <Icon name="link" size={14} /> View
                            </Link>
                            <button
                              type="button"
                              className={cred.is_revoked ? styles.actionButton : styles.terminateButton}
                              onClick={() => toggleRevocation(cred.id, cred.is_revoked)}
                              disabled={submitting}
                            >
                              {cred.is_revoked ? 'Reinstate' : 'Revoke'}
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: '0.84rem', color: 'var(--text)', margin: '0.35rem 0' }}>
                          <strong>Track:</strong> {cred.stream_or_track}
                        </div>
                        <div className={styles.milestoneMeta}>
                          {cred.start_date && cred.end_date && (
                            <span>Tenure: {cred.start_date} to {cred.end_date}</span>
                          )}
                          <span>Issued: {cred.created_at ? new Date(cred.created_at).toLocaleDateString() : 'N/A'}</span>
                          {cred.issued_by && <span>Issued by: {cred.issued_by}</span>}
                        </div>
                        {cred.recommendation_text && (
                          <div className={styles.reviewNotesBox} style={{ borderLeftColor: '#ca8a04', marginTop: '0.45rem' }}>
                            <strong>Recommendation:</strong> {cred.recommendation_text}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.modalActions}>
                  <button type="button" className={styles.secondaryButton} onClick={closeModal}>Close</button>
                </div>
              </div>
            )}
              </div>
            </div>
          )}

          {modal === 'extend' && extensionTarget && (
            <div className={styles.modalContent} style={{ padding: '1.4rem', maxWidth: '580px', width: '100%' }}>
              <div className={styles.modalHeader} style={{ padding: 0, borderBottom: 'none', marginBottom: '0.85rem' }}>
                <div>
                  <p className={styles.eyebrow}>Tenure Extension</p>
                  <h2 id="modal-title" style={{ fontSize: '1.25rem' }}>Extend Internship Tenure</h2>
                </div>
                <button type="button" className={styles.iconButton} onClick={closeModal} aria-label="Close dialog"><Icon name="close" /></button>
              </div>
              <p className={styles.confirmText} style={{ marginBottom: '1rem' }}>
                Select extension duration for <strong>{extensionTarget.full_name}</strong> ({extensionTarget.designation} • {extensionTarget.department}).
              </p>

              <div style={{ padding: '0.85rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '1.15rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--muted)' }}>Current Contract End:</span>
                  <strong>{dateOnly(extensionTarget.contract_end_date) || 'N/A'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: 'var(--green)' }}>
                  <span>Revised Extended End Date:</span>
                  <strong style={{ fontWeight: 800 }}>{customExtensionDate || 'N/A'}</strong>
                </div>
              </div>

              <div className={styles.formGrid} style={{ gridTemplateColumns: '1fr', gap: '0.85rem' }}>
                <label>
                  Extension Duration
                  <select
                    value={extensionMonths}
                    onChange={(e) => {
                      const val = e.target.value
                      setExtensionMonths(val)
                      if (val !== 'custom') {
                        const computed = calculateExtensionDate(extensionTarget.contract_end_date, Number(val))
                        setCustomExtensionDate(computed)
                      }
                    }}
                  >
                    <option value="1">1 Month (+1M)</option>
                    <option value="2">2 Months (+2M)</option>
                    <option value="3">3 Months (+3M)</option>
                    <option value="6">6 Months (+6M)</option>
                    <option value="12">12 Months (+1 Year)</option>
                    <option value="custom">Custom Date (Pick Date Below)</option>
                  </select>
                </label>

                <label>
                  New Extended Contract End Date (YYYY-MM-DD)
                  <input
                    type="date"
                    value={customExtensionDate}
                    onChange={(e) => {
                      setCustomExtensionDate(e.target.value)
                      setExtensionMonths('custom')
                    }}
                    required
                  />
                </label>
              </div>

              {error && <div className={styles.error} role="alert" style={{ marginTop: '0.85rem' }}>{error}</div>}

              <div className={styles.modalActions} style={{ flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button type="button" className={styles.secondaryButton} onClick={closeModal}>Cancel</button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={submitting || !customExtensionDate}
                  onClick={() => openEmailPreview('EXTENSION_EMAIL', extensionTarget, { new_contract_end_date: customExtensionDate })}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Icon name="eye" size={15} /> Preview Email
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={submitting || !customExtensionDate}
                  onClick={() => openPdfPreview('EXTENSION', extensionTarget, { new_contract_end_date: customExtensionDate })}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Icon name="eye" size={15} /> Preview PDF
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={submitting || !customExtensionDate}
                  onClick={async () => {
                    try {
                      await downloadExtensionPdf(extensionTarget.id, customExtensionDate)
                      setModal(null)
                      await loadEmployees()
                    } catch (err) {
                      console.error('[Extension Error]', err)
                    }
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {submitting ? 'Generating PDF...' : (
                    <>
                      <Icon name="download" size={15} /> Download PDF Only
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className={styles.dispatchButton}
                  disabled={submitting || !customExtensionDate}
                  onClick={async () => {
                    try {
                      await dispatchExtensionLetter(extensionTarget.id, customExtensionDate)
                    } catch (err) {
                      console.error('[Extension Dispatch Error]', err)
                    }
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {submitting ? 'Dispatching...' : (
                    <>
                      <Icon name="mail" size={15} /> Dispatch Extension via Email
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {modal === 'email-preview' && emailPreview && (
            <div className={styles.modalContent} style={{ maxWidth: '820px', width: '100%', padding: '1.25rem' }}>
              <div className={styles.modalHeader} style={{ padding: '0 0 0.85rem 0', borderBottom: '1px solid var(--border)', marginBottom: '0.85rem' }}>
                <div style={{ flex: 1 }}>
                  <p className={styles.eyebrow}>Interactive Email Preview</p>
                  <h2 id="modal-title" style={{ fontSize: '1.15rem', margin: '0.15rem 0' }}>{emailPreview.subject}</h2>
                  <div style={{ display: 'flex', gap: '0.85rem', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                    <span><strong>To:</strong> {emailPreview.recipient}</span>
                    <span><strong>CC:</strong> {emailPreview.cc}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', height: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    onClick={() => setPreviewTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                  >
                    {previewTheme === 'dark' ? (
                      <>
                        <Icon name="sun" size={13} /> Light View
                      </>
                    ) : (
                      <>
                        <Icon name="moon" size={13} /> Dark View
                      </>
                    )}
                  </button>
                  <button type="button" className={styles.iconButton} onClick={closeModal} aria-label="Close dialog"><Icon name="close" /></button>
                </div>
              </div>

              <div style={{
                borderRadius: '12px',
                border: '1px solid var(--border)',
                overflow: 'hidden',
                background: previewTheme === 'dark' ? '#0d1117' : '#f4f6f8',
                height: '520px',
              }}>
                <iframe
                  title="Email Live Preview"
                  srcDoc={previewTheme === 'dark'
                    ? emailPreview.html.replace('</head>', `
                      <style>
                        body, .email-wrapper { background-color: #0d1117 !important; }
                        .email-container { background-color: #161b22 !important; border-color: #30363d !important; }
                        .text-title, .text-primary, h1, h2, h3, p, strong, td { color: #f0f6fc !important; }
                        .text-subtle, .text-muted, .footer-text { color: #8b949e !important; }
                        .box-card, .footer-bg, .info-row { background-color: #21262d !important; border-color: #30363d !important; color: #e6edf3 !important; }
                        .divider { border-top-color: #30363d !important; color: #8b949e !important; }
                        a.text-accent { color: #00e599 !important; }
                      </style></head>`)
                    : emailPreview.html
                  }
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                />
              </div>

              <div className={styles.modalActions} style={{ borderTop: '1px solid var(--border)', paddingTop: '0.85rem', marginTop: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <button type="button" className={styles.secondaryButton} onClick={closeModal}>Close Preview</button>
                {emailPreview.type === 'OFFER_EMAIL' && (
                  <button
                    type="button"
                    className={styles.dispatchButton}
                    disabled={submitting}
                    onClick={() => dispatchOfferLetter(emailPreview.employee.id)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    {submitting ? 'Dispatching...' : (
                      <>
                        <Icon name="mail" size={15} /> Dispatch Offer via Email
                      </>
                    )}
                  </button>
                )}
                {emailPreview.type === 'EXTENSION_EMAIL' && (
                  <button
                    type="button"
                    className={styles.dispatchButton}
                    disabled={submitting}
                    onClick={() => dispatchExtensionLetter(emailPreview.employee.id, emailPreview.extraData?.new_contract_end_date)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    {submitting ? 'Dispatching...' : (
                      <>
                        <Icon name="mail" size={15} /> Dispatch Extension via Email
                      </>
                    )}
                  </button>
                )}
                {emailPreview.type === 'TERMINATION_EMAIL' && (
                  <button
                    type="button"
                    className={styles.terminateButton}
                    disabled={submitting}
                    onClick={confirmTermination}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    {submitting ? 'Revoking Access...' : (
                      <>
                        <Icon name="alert" size={15} /> Confirm & Dispatch Termination
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {modal === 'pdf-preview' && pdfPreview && (
            <div className={styles.modalContent} style={{ maxWidth: '850px', width: '100%', padding: '1.25rem' }}>
              <div className={styles.modalHeader} style={{ padding: '0 0 0.85rem 0', borderBottom: '1px solid var(--border)', marginBottom: '0.85rem' }}>
                <div>
                  <p className={styles.eyebrow}>Official Document Preview</p>
                  <h2 id="modal-title" style={{ fontSize: '1.15rem', margin: '0.15rem 0' }}>{pdfPreview.title}</h2>
                  {pdfPreview.referenceId && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontFamily: 'monospace' }}>Ref: {pdfPreview.referenceId}</span>
                  )}
                </div>
                <button type="button" className={styles.iconButton} onClick={closeModal} aria-label="Close dialog"><Icon name="close" /></button>
              </div>

              <div style={{ borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', height: '560px', background: 'var(--surface)' }}>
                <object
                  data={pdfPreview.url}
                  type="application/pdf"
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                >
                  <iframe
                    title="PDF Live Preview"
                    src={pdfPreview.url}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  >
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
                      <p>Your browser does not support inline PDF preview.</p>
                      <a href={pdfPreview.url} download={pdfPreview.filename} className={styles.primaryButton} style={{ display: 'inline-block', marginTop: '1rem', textDecoration: 'none' }}>
                        Download PDF
                      </a>
                    </div>
                  </iframe>
                </object>
              </div>

              <div className={styles.modalActions} style={{ borderTop: '1px solid var(--border)', paddingTop: '0.85rem', marginTop: '0.85rem' }}>
                <button type="button" className={styles.secondaryButton} onClick={closeModal}>Close Preview</button>
                <a
                  href={pdfPreview.url}
                  download={pdfPreview.filename}
                  className={styles.primaryButton}
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Icon name="download" size={15} /> Download PDF
                </a>
              </div>
            </div>
          )}

          {modal === 'confirm-activate' && activationTarget && (
            <div className={styles.modalContent} style={{ maxWidth: '520px', width: '100%', padding: '1.5rem' }}>
              <div className={styles.modalHeader} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.85rem', marginBottom: '1rem' }}>
                <div>
                  <p className={styles.eyebrow} style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Icon name="zap" size={14} /> Onboarding Activation
                  </p>
                  <h2 id="modal-title" style={{ fontSize: '1.2rem', margin: '0.2rem 0' }}>Activate {activationTarget.full_name}</h2>
                  <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{activationTarget.designation} • {activationTarget.department}</span>
                </div>
                <button type="button" className={styles.iconButton} onClick={closeModal} aria-label="Close dialog"><Icon name="close" /></button>
              </div>

              <p style={{ fontSize: '0.9rem', color: 'var(--foreground)', lineHeight: 1.6, margin: '0 0 1rem 0' }}>
                This candidate already has provisioned Zoho enterprise credentials saved in the database.
              </p>

              <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem', fontSize: '0.85rem', lineHeight: 1.6 }}>
                <div><strong>Candidate:</strong> {activationTarget.full_name}</div>
                <div><strong>Personal Email:</strong> {activationTarget.personal_email}</div>
                {activationTarget.work_email && <div><strong>Work Email (Zoho):</strong> {activationTarget.work_email}</div>}
              </div>

              {error && <div className={styles.error} role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

              <div className={styles.modalActions} style={{ flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className={styles.secondaryButton} onClick={closeModal}>Cancel</button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => confirmActivation({ skipEmail: true })}
                  disabled={submitting}
                  title="Activate status to ACTIVE without dispatching welcome email"
                >
                  Skip Email & Activate
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => confirmActivation({ skipEmail: false })}
                  disabled={submitting}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {submitting ? 'Activating & Sending...' : (
                    <>
                      <Icon name="zap" size={15} /> Activate & Send Welcome Email
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {modal === 'activate-credentials' && activationTarget && (
            <div className={styles.modalContent} style={{ maxWidth: '560px', width: '100%', padding: '1.5rem' }}>
              <div className={styles.modalHeader} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.85rem', marginBottom: '1rem' }}>
                <div>
                  <p className={styles.eyebrow} style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Icon name="shield" size={14} /> Provision Workspace & Activate
                  </p>
                  <h2 id="modal-title" style={{ fontSize: '1.2rem', margin: '0.2rem 0' }}>Activate {activationTarget.full_name}</h2>
                  <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{activationTarget.designation} • {activationTarget.department}</span>
                </div>
                <button type="button" className={styles.iconButton} onClick={closeModal} aria-label="Close dialog"><Icon name="close" /></button>
              </div>

              <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 1.25rem 0' }}>
                No Zoho workspace credentials found for this candidate. You can enter them below to dispatch the Welcome Email with credentials, or click <strong>Activate & Send Welcome Email</strong> to send the standard Welcome Email without credentials.
              </p>

              <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.25rem' }}>
                <label className={styles.label}>
                  Zoho Work Email (Optional)
                  <input
                    type="email"
                    className={styles.input}
                    value={activationCreds.work_email}
                    onChange={(e) => setActivationCreds({ ...activationCreds, work_email: e.target.value })}
                    placeholder="e.g. name@skillbun.tech"
                  />
                </label>

                <label className={styles.label}>
                  Zoho Temporary Password (Optional)
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showActivationPassword ? 'text' : 'password'}
                      className={styles.input}
                      value={activationCreds.password}
                      onChange={(e) => setActivationCreds({ ...activationCreds, password: e.target.value })}
                      placeholder="Enter temporary password for candidate"
                    />
                    <button
                      type="button"
                      onClick={() => setShowActivationPassword(!showActivationPassword)}
                      aria-label={showActivationPassword ? 'Hide password' : 'Show password'}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--muted)',
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      <Icon name={showActivationPassword ? 'eyeOff' : 'eye'} size={16} />
                    </button>
                  </div>
                </label>

                <label className={styles.label}>
                  Access Notes (Optional)
                  <textarea
                    className={styles.textarea}
                    rows={2}
                    value={activationCreds.access_notes}
                    onChange={(e) => setActivationCreds({ ...activationCreds, access_notes: e.target.value })}
                    placeholder="e.g. Workspace Pro Admin, Discord role assigned"
                  />
                </label>
              </div>

              {error && <div className={styles.error} role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

              <div className={styles.modalActions} style={{ flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className={styles.secondaryButton} onClick={closeModal}>Cancel</button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => confirmActivation({ skipEmail: true })}
                  disabled={submitting}
                  title="Activate status to ACTIVE without dispatching any email"
                >
                  Skip Email & Activate
                </button>
                {activationCreds.work_email.trim() && activationCreds.password ? (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => confirmActivation({ skipEmail: false, withFormCreds: true })}
                    disabled={submitting}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    {submitting ? 'Saving & Activating...' : (
                      <>
                        <Icon name="check" size={15} /> Save Credentials & Activate
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => confirmActivation({ skipEmail: false, withFormCreds: false })}
                    disabled={submitting}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    {submitting ? 'Activating & Sending...' : (
                      <>
                        <Icon name="mail" size={15} /> Activate & Send Welcome Email
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>}
      {toast && <div className={styles.toast} role="status">{toast}</div>}
    </main>
  )
}
