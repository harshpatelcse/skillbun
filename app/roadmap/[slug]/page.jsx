import fs from 'fs'
import path from 'path'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import GameMap from './GameMap'

const ROADMAPS_DIR = path.join(process.cwd(), 'public', 'data', 'roadmaps')
const ROADMAP_SLUG_PATTERN = /^[a-z0-9_]+$/
const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:'])

function getRoadmapPath(slug) {
  if (typeof slug !== 'string' || !ROADMAP_SLUG_PATTERN.test(slug)) {
    return null
  }

  const roadmapPath = path.join(ROADMAPS_DIR, `${slug}.json`)
  const relativePath = path.relative(ROADMAPS_DIR, roadmapPath)

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null
  }

  return roadmapPath
}

function readRoadmap(slug) {
  const roadmapPath = getRoadmapPath(slug)

  if (!roadmapPath || !fs.existsSync(roadmapPath)) {
    return null
  }

  try {
    return JSON.parse(fs.readFileSync(roadmapPath, 'utf8'))
  } catch {
    return null
  }
}

function isSafeExternalUrl(url) {
  if (typeof url !== 'string' || !url.trim()) {
    return false
  }

  try {
    return SAFE_EXTERNAL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

function buildAskBunBotHref(topicName, roadmapTitle) {
  const params = new URLSearchParams({
    q: `Explain ${topicName} in simple terms`,
    context: `${roadmapTitle} Roadmap`,
  })

  return `/counsellor?${params.toString()}`
}

export function generateStaticParams() {
  return fs
    .readdirSync(ROADMAPS_DIR)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => ({ slug: fileName.replace(/\.json$/, '') }))
    .filter(({ slug }) => ROADMAP_SLUG_PATTERN.test(slug))
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const data = readRoadmap(slug)
  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://skillbun.tech').replace(/\/+$/, '')

  if (!data) {
    return { title: { absolute: 'Roadmap Not Found | SkillBun' } }
  }

  const title = `${data.title} Roadmap | SkillBun`
  const description = data.description || `Explore the free ${data.title} roadmap with step-by-step skills, study resources and practice topics on SkillBun.`
  const pageUrl = `${siteUrl}/roadmap/${slug}`

  return {
    title: { absolute: title },
    description,
    keywords: [
      data.title,
      `Free ${data.title} Roadmap`,
      `${data.title} Learning Path Free`,
      `${data.title} Study Guide`,
      `Free ${data.title} Certification`,
      'SkillBun Free Roadmap',
      'Tech Career Guidance Free',
    ],
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: 'SkillBun',
      images: [
        {
          url: '/logo.png',
          width: 512,
          height: 512,
          alt: `${data.title} SkillBun Roadmap`,
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: ['/logo.png'],
    },
  }
}

export default async function RoadmapPage({ params, searchParams }) {
  const { slug } = await params
  const { tab } = (await searchParams) || {}
  const data = readRoadmap(slug)
  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://skillbun.tech').replace(/\/+$/, '')
  const nonce = (await headers()).get('x-nonce') || undefined

  if (!data) {
    notFound()
  }

  const roadmapJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [{
    '@type': 'LearningResource',
    '@id': `${siteUrl}/roadmap/${slug}#roadmap`,
    name: `${data.title} Learning Roadmap`,
    description: data.description,
    isAccessibleForFree: true,
    learningResourceType: 'Career roadmap',
    inLanguage: 'en',
    publisher: {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'SkillBun',
      url: siteUrl,
    },
    url: `${siteUrl}/roadmap/${slug}`,
    }, {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'SkillBun', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Career roadmaps', item: `${siteUrl}/roadmap` },
        { '@type': 'ListItem', position: 3, name: data.title, item: `${siteUrl}/roadmap/${slug}` },
      ],
    }],
  }

  return (
    <>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(roadmapJsonLd).replace(/</g, '\\u003c') }}
      />
      <GameMap key={slug} roadmap={data} slug={slug} initialTab={tab} />
    </>
  )
}
