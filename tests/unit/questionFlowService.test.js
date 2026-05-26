'use strict';

const { getNextQuestion, buildFlowState, mergeAnswer, QUESTION_CATALOGUE } = require('../../src/services/questionFlowService');

describe('questionFlowService', () => {
  describe('getNextQuestion', () => {
    test('returns null when no questions', () => {
      expect(getNextQuestion([])).toBeNull();
      expect(getNextQuestion(null)).toBeNull();
    });

    test('returns critical question before recommended', () => {
      const questions = [
        { field: 'schedule', severity: 'recommended', question: 'When?' },
        { field: 'discounts', severity: 'critical', question: 'What discount?' },
      ];
      const result = getNextQuestion(questions);
      expect(result.question.fieldId).toBe('discounts');
      expect(result.question.severity).toBe('critical');
    });

    test('returns well-formed question with text, hint, type', () => {
      const questions = [{ field: 'discounts', severity: 'critical', question: 'What discount?' }];
      const result = getNextQuestion(questions);
      expect(result.question).toHaveProperty('text');
      expect(result.question).toHaveProperty('hint');
      expect(result.question).toHaveProperty('type');
      expect(result.question).toHaveProperty('fieldId');
    });

    test('totalRemaining counts all questions', () => {
      const questions = [
        { field: 'discounts', severity: 'critical', question: 'q1' },
        { field: 'schedule', severity: 'recommended', question: 'q2' },
        { field: 'qualifyingProducts', severity: 'recommended', question: 'q3' },
      ];
      const result = getNextQuestion(questions);
      expect(result.totalRemaining).toBe(3);
      expect(result.criticalRemaining).toBe(1);
    });

    test('shippingMethods question is critical', () => {
      const questions = [{ field: 'shippingRuleOptions.methodIds', severity: 'critical', question: 'q' }];
      const result = getNextQuestion(questions);
      expect(result.question.fieldId).toBe('shippingRuleOptions.methodIds');
      expect(result.question.choices).toBeDefined();
    });
  });

  describe('buildFlowState', () => {
    test('no clarification → nextQuestion is null', () => {
      const parserResult = {
        clarificationRequired: false,
        clarificationQuestions: [],
      };
      const state = buildFlowState(parserResult);
      expect(state.clarificationRequired).toBe(false);
      expect(state.nextQuestion).toBeNull();
      expect(state.totalQuestionsRemaining).toBe(0);
    });

    test('with critical questions → nextQuestion present', () => {
      const parserResult = {
        clarificationRequired: true,
        clarificationQuestions: [
          { field: 'discounts', severity: 'critical', question: 'What discount?' },
          { field: 'schedule', severity: 'recommended', question: 'When?' },
        ],
      };
      const state = buildFlowState(parserResult);
      expect(state.clarificationRequired).toBe(true);
      expect(state.nextQuestion).toBeDefined();
      expect(state.nextQuestion.fieldId).toBe('discounts');
      expect(state.totalQuestionsRemaining).toBe(2);
      expect(state.criticalQuestionsRemaining).toBe(1);
    });
  });

  describe('mergeAnswer', () => {
    test('combines original intent with answer', () => {
      const merged = mergeAnswer('free shipping', 'discounts', 'standard shipping');
      expect(merged).toContain('free shipping');
      expect(merged).toContain('standard shipping');
    });

    test('trims whitespace', () => {
      const merged = mergeAnswer('  free shipping  ', 'discounts', '  standard  ');
      expect(merged.startsWith('free shipping')).toBe(true);
    });
  });

  describe('QUESTION_CATALOGUE', () => {
    test('has entries for all critical fields', () => {
      expect(QUESTION_CATALOGUE).toHaveProperty('discounts');
      expect(QUESTION_CATALOGUE).toHaveProperty(['shippingRuleOptions.methodIds']);
      expect(QUESTION_CATALOGUE).toHaveProperty('activationCoupons');
      expect(QUESTION_CATALOGUE).toHaveProperty('schedule');
    });

    test('each entry has required fields', () => {
      Object.values(QUESTION_CATALOGUE).forEach(entry => {
        expect(entry).toHaveProperty('question');
        expect(entry).toHaveProperty('hint');
        expect(entry).toHaveProperty('type');
        expect(entry).toHaveProperty('severity');
      });
    });
  });
});
