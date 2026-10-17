// Durazno estilizado del mockup.
export default function Logo({ className = 'marca__logo' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="18" r="12" fill="#e8875a" />
      <path d="M16 8c0 6 0 13-1 20" stroke="#c4572e" strokeWidth="1.4" fill="none" />
      <path d="M17 7c2-4 6-5 8-4-1 3-4 5-8 4z" fill="#6fae7f" />
    </svg>
  )
}
