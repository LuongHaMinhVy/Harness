// Link tới commit GitHub đã ghim khi nộp. Chỉ tạo link https://github.com/... từ thành phần đã kiểm tra
// (không bao giờ dùng nguyên chuỗi từ dữ liệu làm href).

const REPO = /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})(?:[/?#]|$)/;
const SHA = /^[0-9a-f]{7,40}$/i;

export const shortSha = (sha: string) => sha.slice(0, 7);

export function commitUrl(githubUrl: string | null, sha: string | null): string | null {
  if (!githubUrl || !sha || !SHA.test(sha)) return null;
  const m = REPO.exec(githubUrl);
  if (!m) return null;
  const repo = m[2]!.replace(/\.git$/, '');
  return `https://github.com/${m[1]}/${repo}/commit/${sha}`;
}
