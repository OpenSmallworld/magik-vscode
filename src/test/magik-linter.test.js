'use strict';

const MagikLinter = require('../magik-linter');
const MagikVar = require('../magik-variables');

const mockContext = {
  subscriptions: {
    push: jest.fn()
  }
};

describe('Magik Linter indentation', () => {
  const magikLinter = new MagikLinter({}, {}, mockContext);

  const testIndentLines = [
    {
      description: 'method definition',
      magikLines: [
        '_method hello.new()',
        'write("hello")',
        '_endmethod',
        '$'
      ],
      expectedIndent: [0, 1, 0, 0]
    },
    {
      description: 'if statement',
      magikLines: [
        '_if _true',
        '_then',
        'write("hello")',
        '_endif'
      ],
      expectedIndent: [0, 0, 1, 0]
    },
    {
      description: 'if else statement',
      magikLines: [
        '_if _true',
        '_then',
        'write("hello")',
        '_else',
        'write("not here")',
        '_endif'
      ],
      expectedIndent: [0, 0, 1, 0, 1, 0]
    },
    {
      description: 'for loop statement',
      magikLines: [
        '_for i _over range(1, 5)',
        '_loop',
        '_if (i _div 2) _is 1',
        '_then',
        'write(i, " is odd")',
        '_endif',
        '_finally',
        'write("end")',
        '_endloop'
      ],
      expectedIndent: [0, 0, 1, 1, 2, 1, 0, 1, 0]
    },
    {
      description: 'proc statement with assignment',
      magikLines: [
        'a_proc << _proc()',
        'write("hello")',
        '_endproc'
      ],
      expectedIndent: [0, 2, 1]
    },
    {
      description: 'variable assignment',
      magikLines: [
        'multiline <<',
        'hello'
      ],
      expectedIndent: [0, 1]
    },
    {
      description: 'multiline variable assignment',
      magikLines: [
        'multiline << "hello" +',
        'world'
      ],
      expectedIndent: [0, 1]
    },
    {
      description: 'variable assignment from if statement',
      magikLines: [
        'a << _if _true',
        '_then',
        '>> 1',
        '_endif',
        'write(a)'
      ],
      expectedIndent: [0, 1, 2, 1, 0]
    },
    {
      description: 'chained method calls',
      magikLines: [
        '_self.method_1().',
        'method_2().',
        'method_3()',
        'write("hello")'
      ],
      expectedIndent: [0, 1, 1, 0]
    },
    {
      description: 'vector brackets',
      magikLines: [
        'a << {',
        '{"hello"},',
        '{"world"}',
        '}',
        'a[1]'
      ],
      expectedIndent: [0, 1, 1, 0, 0]
    },
    {
      description: 'try statement',
      magikLines: [
        '_try _with cond',
        '# some code',
        '',
        '_when error',
        'write(cond.report_contents_string)',
        '_endtry'
      ],
      expectedIndent: [0, 1, 1, 0, 1, 0]
    },
    {
      description: 'protection statement',
      magikLines: [
        '_protect',
        '# some code',
        '_protection',
        '# some code',
        '_endprotect'
      ],
      expectedIndent: [0, 1, 0, 1, 0]
    },
    {
      description: 'invalid if statement',
      magikLines: [
        '_if _true',
        '_then',
        'write("hello")',
        '_endif',
        '_else',
        '_endif'
      ],
      expectedIndent: [0, 0, 1, 0, -1, -1]
    },
  ];

  testIndentLines.forEach((data) => {
    test(`should indent ${data.description}`, async () => {
      const testLines = data.magikLines;
      const result = await magikLinter._indentMagikLines(testLines, 1, testLines.length, true, true);
      expect(result).toEqual(data.expectedIndent);
    });
  });
})

describe('Magik Linter variables', () => {
  const magikLinter = new MagikLinter({}, {}, mockContext);

  test('should find unused variable', () => {
    // given
    const testLines = [
      '_method new_test.test()',
      'a << rope.new()',
      'b << 1 + 2',
      'write(b)',
      '_endmethod'
    ];
    const classNames = ['rope'];
    const classData = {rope: {}};
    const globals = [];
    const diagnostics = [];


    // when
    const vars = MagikVar.getVariables(testLines, 1, classNames, classData, globals, diagnostics);
    magikLinter._checkUnusedVariables(vars, diagnostics);

    // then
    expect(diagnostics.length).toBe(1);
  });

  test('should find unused parameter', () => {
    // given
    const testLines = [
      '_method new_test.test(param1, param2)',
      'a << rope.new(param1)',
      'write(a)',
      '_endmethod'
    ];
    const classNames = ['rope'];
    const classData = {rope: {}};
    const globals = [];
    const diagnostics = [];


    // when
    const vars = MagikVar.getVariables(testLines, 1, classNames, classData, globals, diagnostics);
    magikLinter._checkUnusedVariables(vars, diagnostics);

    // then
    expect(diagnostics.length).toBe(1);
  });
});
