export default function LoadingBox({ text = 'Loading…', height = '200px' }) {
  return (
    <div
      className="d-flex align-items-center justify-content-center text-muted"
      style={{ minHeight: height }}
    >
      <div className="text-center">
        <div className="spinner-border spinner-border-sm me-2" role="status" />
        {text}
      </div>
    </div>
  );
}
