condition
  = sp c:disj { return c; }

disj
  = first:conj rest:('or' sp rhs:conj { return ' || ' + rhs; })* {
      return [first, ...rest].join('');
    }

conj
  = first:neg rest:('and' sp rhs:neg { return ' && ' + rhs; })* {
      return [first, ...rest].join('');
    }

neg
  = 'not' sp rhs:boolean_atom { return '!' + rhs; }
  / boolean_atom

boolean_atom
  = boolean_literal
  / boolean_parens
  / cmp

boolean_literal
  = $('true' / 'false')

boolean_parens
  = '(' c:condition ')' sp { return '(' + c + ')'; }

cmp
  = lhs:value op:cmp_op rhs:value { return lhs + ' ' + op + ' ' + rhs; }

cmp_op
  = $([<>] '='?)
  / '=' { return '=='; }
  / '≤' { return '<='; }
  / '≥' { return '>='; }

value
  = sp a:add { return a; }

array
  = sp first:value rest:(',' sp v:value {return v;})* {
      return 'Float32Array.from([' + [first, ...rest].join(', ') + '])';
    }

add
  = lhs:mul rest:(op:[+-] sp rhs:mul { return op + ' ' + rhs; })* {
      return lhs + ' ' + rest.join(' ');
    }
  / mul

mul
  = lhs:sign rest:(op:([*×·/%] / !(sp [+-])) sp rhs:sign {
		     if (op === undefined || !/[\/%]/.test(op)) { op = '*'; }
		     return op + ' ' + rhs;
		   })* {
      return lhs + ' ' + rest.join(' ');
    }
  / sign

sign
  = op:[+-] sp rhs:exp { return op + rhs; }
  / exp

exp
  = b:atom '^' e:atom { return 'Math.pow(' + b + ', ' + e + ')'; }
  / atom

atom
  = parens
  / variable
  / constant
  / function_call
  / number

parens
  = '(' v:value ')' sp { return '(' + v + ')'; }

function_call
  = 'st' sp '(' arg:value ')' sp { return 'Math.pow(2, (' + arg + ') / 12)'; }
  / 'if' sp '(' arg:condition ')' sp { return '(0 + (window.isPrevCondTrue = (' + arg + ')))'; }
  / 'elif' sp '(' arg:condition ')' sp { return '(0 + ((!window.isPrevCondTrue) && (window.isPrevCondTrue = (' + arg + '))))'; }
  / 'else' sp ('(' sp ')' sp)? { return '(!window.isPrevCondTrue)'; }
  / name:function_name '(' first:value rest:(',' v:value {return v;})* ')' sp {
      return name + '(' + [first, ...rest].join(',') + ')';
    }
  / name:function_name '(' sp ')' sp { return name + '()'; }
  / '√' sp arg:atom { return 'Math.sqrt(' + arg + ')'; }

function_name
  = name:$([a-z] [0-9a-z]*) sp {
      if ((name in Math) && !(name in Object)) {
	return 'Math.' + name;
      } else {
	error('Not a math function: ' + name);
      }
    }

variable
  = v:[nfvor] ![a-z] sp { return v; }

constant
  = ('pi' ![a-z] / 'PI' / 'π') { return 'Math.PI'; }
  / ('tau' ![a-z] / 'TAU' / 'τ') { return '(2*Math.PI)'; }
  / ('e' ![a-z] / 'E') { return 'Math.E'; }

number
  = $((
      [0-9]* '.' [0-9]+
    / [0-9]+ '.'?
    ) sp)

sp
  = [ \n\r\t]*
