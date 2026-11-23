import type { ContributorFlavor } from '../people/ContributorCard.js'

export interface Steward {
  name: string
  role: string
  /** A MetaCensus title, which the roster styles apart from a descriptive one. */
  metacensusTitle?: boolean
  /** Absent for the advisory board, who advise rather than build. */
  flavor?: ContributorFlavor
  link?: string
  /** The portrait's file name; each site serves the files it names. */
  portrait: string
}

export const cofounders: readonly Steward[] = [
  {
    name: 'Ryan Nelson, PharmD',
    role: 'Executive Director',
    metacensusTitle: true,
    flavor: 'quantitative',
    link: 'https://www.aruplab.com/experts/nelson-0',
    portrait: 'ryan-nelson.webp',
  },
  {
    name: 'Jacob Barzee',
    role: 'Director of Engineering',
    metacensusTitle: true,
    flavor: 'engineering',
    link: 'https://www.linkedin.com/in/jacob-barzee-8b69b772/',
    portrait: 'jacob-barzee.webp',
  },
]

/** MetaCensus-titled people lead. */
export const contributors: readonly Steward[] = [
  {
    name: 'Erik Forsman, BS',
    role: 'Founding Engineer',
    metacensusTitle: true,
    flavor: 'engineering',
    link: 'https://www.linkedin.com/in/erik-forsman-a4237289/',
    portrait: 'erik-forsman.webp',
  },
  {
    name: 'Michael Bonner',
    role: 'Web Development',
    flavor: 'engineering',
    link: 'https://michaelbonner.dev',
    portrait: 'michael-bonner.webp',
  },
  {
    name: 'Rob Shirley, MS',
    role: 'Full-Stack Development',
    flavor: 'engineering',
    portrait: 'rob-shirley.webp',
  },
  {
    name: 'Caleb Barzee, BS',
    role: 'Software Engineer',
    flavor: 'engineering',
    portrait: 'caleb-barzee.webp',
  },
  {
    name: 'Tanner Denti, BS',
    role: 'Backend Engineer',
    flavor: 'engineering',
    portrait: 'tanner-denti.webp',
  },
  {
    name: 'Jonas Barzee',
    role: 'Software Engineer Intern',
    flavor: 'engineering',
    portrait: 'jonas-barzee.webp',
  },
  {
    name: 'Patrick Mower, MS',
    role: 'Backend Engineer',
    flavor: 'engineering',
    portrait: 'patrick-mower.webp',
  },
  {
    name: 'David Houghton, BS',
    role: 'Information Systems & Policy',
    flavor: 'engineering',
    portrait: 'david-houghton.webp',
  },
  {
    name: 'Jaime Natoli, MPH, MS, CGC',
    role: 'Clinical Consultant, Evidence-Based Medicine',
    flavor: 'quantitative',
    link: 'https://www.researchgate.net/profile/Jaime-Natoli-2',
    portrait: 'jaime-natoli.webp',
  },
  {
    name: 'Carrie Hoefer, PhD, MBA',
    role: 'Pharmacogenomics',
    flavor: 'quantitative',
    portrait: 'carrie-hoefer.webp',
  },
  {
    name: 'Michael K.B. Ford',
    role: 'Applied AI Engineer',
    metacensusTitle: true,
    // He designs the science and builds it.
    flavor: 'both',
    portrait: 'michael-ford.webp',
  },
]

export const advisoryBoard: readonly Steward[] = [
  {
    name: 'Sara Rogers, PharmD',
    role: 'President, American Society of Pharmacovigilance',
    portrait: 'sara-rogers.webp',
  },
  {
    name: 'Sharmeen Roy, PharmD, BCPS',
    role: 'Founder and CEO, Qist Health',
    portrait: 'sharmeen-roy.webp',
  },
  {
    name: 'Howard L. McLeod, PharmD, FASCO, FCCP',
    role: 'Director, Center for Precision Medicine',
    portrait: 'howard-mcleod.webp',
  },
]
