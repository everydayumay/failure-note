// scripts/report-progress.mjs
// progress.json을 읽어 Mission Control 대시보드(/api/state)에 현재 진행률을 POST한다.
// GitHub Actions에서 master push 시 실행됨 (.github/workflows/dashboard.yml 참고).
//
// 인증: MISSION_CONTROL_TOKEN(또는 DASHBOARD_TOKEN) 환경변수가 있으면
// Authorization: Bearer 헤더를 붙인다. 없으면 무인증으로 전송한다.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENDPOINT = 'https://ai-dashboard-pink-iota.vercel.app/api/state';

function loadProgress() {
  const raw = readFileSync(join(__dirname, '..', 'progress.json'), 'utf-8');
  return JSON.parse(raw);
}

function getLastWorked() {
  try {
    return execSync(
      "git log -1 --format=%cd --date=format-local:%Y-%m-%d",
      { env: { ...process.env, TZ: 'Asia/Seoul' }, encoding: 'utf-8' }
    ).trim();
  } catch {
    // git 정보를 못 읽어오면 오늘 날짜(로컬 TZ 무관하게 UTC 기준)로 대체
    return new Date().toISOString().slice(0, 10);
  }
}

function buildPayload(progress) {
  const steps = progress.steps || [];
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const nextStep = steps.find((s) => !s.done);

  return {
    key: progress.key,
    data: {
      name: progress.name,
      icon: progress.icon,
      percent,
      current: done,
      goal: total,
      unit: progress.unit || '단계',
      nextAction: nextStep ? nextStep.text : '전체 완료',
      lastWorked: getLastWorked(),
    },
  };
}

async function main() {
  const progress = loadProgress();
  const payload = buildPayload(progress);

  const headers = { 'Content-Type': 'application/json' };
  const token = process.env.MISSION_CONTROL_TOKEN || process.env.DASHBOARD_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  console.log('[report-progress] POST', ENDPOINT);
  console.log('[report-progress] payload:', JSON.stringify(payload, null, 2));

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log(`[report-progress] response ${res.status}:`, text);

  if (!res.ok) {
    console.error('[report-progress] 전송 실패');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[report-progress] 오류:', err);
  process.exit(1);
});
