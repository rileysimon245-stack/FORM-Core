/**
 * Запуск тестов тренировочного ядра из терминала: npx tsx src/training-core/tests/runTests.ts
 */
import { runTrainingCoreTestSuite } from '../__tests__/suite';

const summary = runTrainingCoreTestSuite();

console.log(`\nFORM Core — Автотесты ядра: ${summary.passed}/${summary.total} пройдено\n`);

for (const r of summary.results) {
  const icon = r.passed ? 'PASS' : 'FAIL';
  console.log(`[${icon}] [${r.group}] ${r.name} — ${r.details}`);
}

if (summary.failed > 0) {
  console.error(`\nПровалено тестов: ${summary.failed}`);
  process.exit(1);
} else {
  console.log('\nВсе тесты успешно пройдены.');
  process.exit(0);
}
