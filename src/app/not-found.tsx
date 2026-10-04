import Link from "next/link";

export default function NotFound() {
  return (
    <div className="screen">
      <div className="body center-v items-center text-center">
        <div className="hero-icon yellow animate-none">?</div>
        <h1 className="h-title">This page doesn&apos;t exist</h1>
        <p className="muted">The link may be old, or the spot has already been taken.</p>
        <Link href="/" className="btn btn-yellow mt-3">
          Find parking
        </Link>
      </div>
    </div>
  );
}
