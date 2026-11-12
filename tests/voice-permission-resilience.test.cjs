const test = require('node:test');
const assert = require('node:assert/strict');

// Simulação de ambiente browser e SpeechRecognition
test('Voice assistant handles no-speech and silent errors without breaking continuous mode', () => {
  let isContinuous = true;
  let hasShownError = false;

  const simulatedErrorHandler = (errEvent) => {
    if (errEvent.error === 'no-speech' || errEvent.error === 'aborted') {
      // Ignorado com sucesso
      return;
    }
    hasShownError = true;
    if (errEvent.error === 'not-allowed') {
      isContinuous = false;
    }
  };

  // 1. Simula 'no-speech' após 8 segundos de silêncio no Chrome
  simulatedErrorHandler({ error: 'no-speech' });
  assert.equal(isContinuous, true, 'Continuous mode should remain active on no-speech');
  assert.equal(hasShownError, false, 'No error toast should be shown for no-speech');

  // 2. Simula 'aborted' durante restart
  simulatedErrorHandler({ error: 'aborted' });
  assert.equal(isContinuous, true, 'Continuous mode should remain active on aborted');
  assert.equal(hasShownError, false, 'No error toast should be shown for aborted');

  // 3. Simula negação explícita
  simulatedErrorHandler({ error: 'not-allowed' });
  assert.equal(isContinuous, false, 'Continuous mode should deactivate when permission is denied');
  assert.equal(hasShownError, true, 'Error should be signaled for not-allowed');
});

test('Session manager creates new instances instead of reusing dead speech objects', () => {
  let createdCount = 0;
  let abortedCount = 0;

  class MockSpeechRecognition {
    constructor() {
      createdCount++;
      this.isStarted = false;
    }
    start() {
      if (this.isStarted) throw new Error('recognition has already started');
      this.isStarted = true;
    }
    abort() {
      abortedCount++;
      this.isStarted = false;
    }
  }

  let currentRec = null;

  function cycleSession() {
    if (currentRec) {
      currentRec.abort();
      currentRec = null;
    }
    currentRec = new MockSpeechRecognition();
    currentRec.start();
  }

  // Ciclo 1 (início)
  cycleSession();
  assert.equal(createdCount, 1);
  assert.equal(abortedCount, 0);

  // Ciclo 2 (após timeout ou volta de background)
  cycleSession();
  assert.equal(createdCount, 2, 'Must create a brand new SpeechRecognition instance');
  assert.equal(abortedCount, 1, 'Must abort the previous instance cleanly');

  // Ciclo 3 (recuperação de foco)
  cycleSession();
  assert.equal(createdCount, 3);
  assert.equal(abortedCount, 2);
});
