'use strict';

const MagikUtils = require('../utils/magik-utils');

describe('Magik Utils method parameters', () => {
  test('should find method params', () => {
    const testLines = [
      '_pragma()',
      '_method new_test.test(param1, param2)',
      'write(param1, param2)',
      '_endmethod',
      '$'
    ];

    const params = MagikUtils.getMethodParams(testLines, 1, true);

    expect(params).toEqual({
      param1: expect.objectContaining({param: true}),
      param2: expect.objectContaining({param: true}),
    });
  });

  test('should find optional method params', () => {
    const testLines = [
      '_pragma()',
      '_method new_test.test(param1, _optional param2, param3)',
      'write(param1, param2, param3)',
      '_endmethod',
      '$'
    ];

    const params = MagikUtils.getMethodParams(testLines, 1, true);

    expect(params).toEqual({
      param1: expect.objectContaining({param: true, optional: false}),
      param2: expect.objectContaining({param: true, optional: true}),
      param3: expect.objectContaining({param: true, optional: true})
    });
  });

  test('should find gathered method param', () => {
    const testLines = [
      '_pragma()',
      '_method new_test.test(param1, _gather param2)',
      'write(param1, param2)',
      '_endmethod',
      '$'
    ];

    const params = MagikUtils.getMethodParams(testLines, 1, true);

    expect(params).toEqual({
      param1: expect.objectContaining({param: true, optional: false}),
      param2: expect.objectContaining({param: true, gather: true})
    });
  });

  test('should find multiline method params', () => {
    const testLines = [
      '_pragma()',
      '_method new_test.test(param1, param2,',
      'param3, param4)',
      'write(param1, param2)',
      '_endmethod',
      '$'
    ];

    const params = MagikUtils.getMethodParams(testLines, 1, true);

    expect(params).toEqual({
      param1: expect.objectContaining({param: true}),
      param2: expect.objectContaining({param: true}),
      param3: expect.objectContaining({param: true}),
      param4: expect.objectContaining({param: true})
    });
  });
});
