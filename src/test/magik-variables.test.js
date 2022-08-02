'use strict';

const MagikVar = require('../magik-variables');

describe('Magik Utils method variables', () => {
  test('should find assigned variable', () => {
    // given
    const testLines = [
      '_method new_test.test(param1)',
      'a << rope.new()',
      'a.add_last("hello world")',
      '_endmethod'
    ];

    // when
    const vars = {};
    MagikVar.findAssignedVariables(testLines, 1, 1, vars);

    // then
    expect(vars).toEqual({
      a: expect.objectContaining({
        className: 'rope'
      })
    });
  });

  test('should find method variables', () => {
    // given
    const testLines = [
      '_method new_test.test(param1)',
      '_dynamic d',
      'a << rope.new()',
      'b << "hello world',
      'd << c << 1 + 2',
      '_endmethod'
    ];
    const classNames = ['rope'];
    const classData = {rope: {}};
    const globals = [];
    const diagnostics = [];


    // when
    const vars = MagikVar.getVariables(testLines, 1, classNames, classData, globals, diagnostics);

    // then
    expect(vars).toEqual({
      param1: expect.objectContaining({
        param: true,
        row: 1
      }),
      a: expect.objectContaining({
        className: 'rope',
        row: 3
      }),
      b: expect.objectContaining({
        className: undefined,
        row: 4
      }),
      c: expect.objectContaining({
        row: 5
      }),
      d: expect.objectContaining({
        dynamic: true,
        row: 5
      })
    });
  });

  test('should find iterator variable', () => {
    // given
    const testLines = [
      '_method new_test.test(param1)',
      '_for i _over range(1, 5)',
      '_loop',
      'a << set.new(i)',
      'write(a)',
      '_endloop',
      '_endmethod'
    ];
    const classNames = ['rope', 'set'];
    const classData = {rope: {}};
    const globals = [];
    const diagnostics = [];


    // when
    const vars = MagikVar.getVariables(testLines, 1, classNames, classData, globals, diagnostics);

    // then
    expect(vars).toEqual({
      param1: expect.objectContaining({
        param: true,
        row: 1
      }),
      i: expect.objectContaining({
        row: 2,
        count: 2
      }),
      a: expect.objectContaining({
        className: 'set',
        row: 4,
        count: 2
      })
    });
  });
});
