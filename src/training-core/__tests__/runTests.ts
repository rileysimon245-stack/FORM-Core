/**
 * Запуск тестов тренировочного ядра из терминала: npx tsx src/training-core/__tests__/runTests.ts
 */
import { runTrainingCoreTestSuite } from './suite';
import {
  runGatewayRegressionCheck,
  runGatewayBypassDetectionTest,
  runAppHooksRegressionCheck,
  runStartupAndRecoveryScreenUiTests,
} from './integrationChecks';

async function main() {
  const coreSummary = runTrainingCoreTestSuite();
  const gatewayCheck = runGatewayRegressionCheck();
  const gatewayBypassCheck = runGatewayBypassDetectionTest();
  const hooksCheck = await runAppHooksRegressionCheck();
  const recoveryUiCheck = await runStartupAndRecoveryScreenUiTests();

  const allResults = [
    ...coreSummary.results,
    gatewayCheck,
    gatewayBypassCheck,
    hooksCheck,
    recoveryUiCheck,
  ];
  const passed = allResults.filter((r) => r.passed).length;
  const failed = allResults.length - passed;

  console.log(`\nFORM Core — Автотесты ядра: ${passed}/${allResults.length} пройдено\n`);

  for (const r of allResults) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`[${icon}] [${r.group}] ${r.name} — ${r.details}`);
  }

  if (failed > 0) {
    console.error(`\nПровалено тестов: ${failed}`);
    process.exit(1);
  } else {
    console.log('\nВсе тесты успешно пройдены.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
