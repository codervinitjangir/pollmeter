interface Props { code: string; }
export default function JoinCodeDisplay({ code }: Props) {
  return (
    <div className="stack stack-2 text-center">
      <p className="join-code-label">Join code</p>
      <div className="join-code" aria-label={`Join code: ${code.split('').join(' ')}`}>{code}</div>
    </div>
  );
}
