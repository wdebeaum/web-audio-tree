value
  = add

array
  = first:value rest:(',' sp v:value {return v;})* {
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
  / name:function_name '(' first:value rest:(',' v:value {return v;})* ')' sp {
      return name + '(' + [first, ...rest].join(',') + ')';
    }

function_name
  = name:$([a-z] [0-9a-z]*) sp {
      if ((name in Math) && !(name in Object)) {
	return 'Math.' + name;
      } else {
	error('Not a math function: ' + name);
      }
    }
  / '√' sp arg:atom { return 'Math.sqrt(' + arg + ')'; }

variable
  = [nfvor]

constant
  = ('pi' / 'PI' / 'π') { return 'Math.PI'; }
  / ('tau' / 'TAU' / 'τ') { return '(2*Math.PI)'; }
  / ('e' / 'E') { return 'Math.E'; }

number
  = $((
      [0-9]* '.' [0-9]+
    / [0-9]+ '.'?
    ) sp)

sp
  = [ \n\r\t]*
