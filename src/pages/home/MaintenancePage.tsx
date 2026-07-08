export default function MaintenancePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', textAlign: 'center', padding: '40px 24px' }}>
      <div style={{ fontSize: 44, marginBottom: 18 }}>🛠️</div>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 10px', letterSpacing: '-0.02em' }}>
        Home is under maintenance
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.6, margin: 0 }}>
        We're working on some improvements here. Check back soon — everything else in the app is working as usual.
      </p>
    </div>
  )
}
