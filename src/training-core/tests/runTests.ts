/**
 * Запуск тестов тренировочного ядра из терминала: npx tsx src/training-core/tests/runTests.ts
 */
import { runTrainingCoreTestSuite } from '../__tests__/suite';
import {
  runGatewayRegressionCheck,
  runGatewayBypassDetectionTest,
  runAppHooksRegressionCheck,
  runStartupAndRecoveryScreenUiTests,
  runSafetyGuardUiIntegrationTests,
  runProgramGeneratorIntegrationTests,
  runActiveWorkoutAutosaveTests,
  runWorkoutsTabUxTests,
} from '../__tests__/integrationChecks';

async function main() {
  const coreSummary = runTrainingCoreTestSuite();
  const gatewayCheck = runGatewayRegressionCheck();
  const gatewayBypassCheck = runGatewayBypassDetectionTest();
  const hooksCheck = await runAppHooksRegressionCheck();
  const recoveryUiCheck = await runStartupAndRecoveryScreenUiTests();
  const safetyGuardUiCheck = await runSafetyGuardUiIntegrationTests();
  const generatorIntegrationChecks = await runProgramGeneratorIntegrationTests();
  const activeWorkoutAutosaveChecks = await runActiveWorkoutAutosaveTests();
  const workoutsTabUxChecks = await runWorkoutsTabUxTests();

  const allResults = [
    ...coreSummary.results,
    gatewayCheck,
    gatewayBypassCheck,
    hooksCheck,
    recoveryUiCheck,
    safetyGuardUiCheck,
    ...generatorIntegrationChecks,
    ...activeWorkoutAutosaveChecks,
    ...workoutsTabUxChecks,
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
