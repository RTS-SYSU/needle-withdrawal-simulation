'use strict';

const ORDINARY_EXIT = 'OrdinaryExit.run';
const CENTER_COLUMNS = ['center_x_um', 'center_y_um', 'center_z_um'];
const MOTOR_COLUMNS = Array.from({length: 5}, (_, i) => 'q_' + i + '_um');
const LEGACY_MOTOR_COLUMNS = Array.from({length: 5}, (_, i) => 'q' + (i + 1) + '_um');
const LEGACY_ALIASES = new Map([
  ['编号', 'id'], ['案例编号', 'id'],
  ['球心x', 'center_x_um'], ['球心y', 'center_y_um'], ['球心z', 'center_z_um'],
  ...LEGACY_MOTOR_COLUMNS.map((column, i) => ['q' + (i + 1), column]),
]);

function delimiterOf(text){
  let quoted=false;const counts=new Map([[',',0],[';',0],['\t',0]]);
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"')i++;else quoted=!quoted;}
    else if(!quoted){if(c==='\n')break;if(counts.has(c))counts.set(c,counts.get(c)+1);}
  }
  return [...counts].sort((a,b)=>b[1]-a[1])[0][0];
}
function readCSV(text){
  if(typeof text!=='string')throw new Error('文件内容必须为文本');
  text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  if(text.includes('\0'))throw new Error('文件包含无效字符，请另存为 UTF-8 CSV');
  const delimiter=delimiterOf(text),rows=[];
  let row=[],field='',quoted=false,closed=false,line=1,rowLine=1;
  const finishField=()=>{row.push(field);field='';closed=false;};
  const finishRow=()=>{finishField();if(row.some(v=>v.trim()))rows.push({cells:row,line:rowLine});row=[];rowLine=line+1;};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){
      if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}
      else{field+=c;if(c==='\n')line++;}
      continue;
    }
    if(c===delimiter){finishField();continue;}
    if(c==='\n'){finishRow();line++;continue;}
    if(closed){if(c===' '||c==='\t')continue;throw new Error(`第 ${line} 行：引号后有多余字符`);}
    if(c==='"'){if(field!=='')throw new Error(`第 ${line} 行：字段中的引号必须成对包围整个字段`);quoted=true;}
    else field+=c;
  }
  if(quoted)throw new Error(`第 ${rowLine} 行：双引号没有闭合`);
  finishRow();return rows;
}
function numeric(value,label,line,unit='μm'){
  const text=String(value??'').trim();
  const atom='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
  if(!new RegExp(`^${atom}(?:/${atom})?$`).test(text))throw new Error(`第 ${line} 行：${label} 必须填写数字（${unit}）`);
  const parts=text.split('/').map(Number),number=parts.length===1?parts[0]:parts[0]/parts[1];
  if(!Number.isFinite(number))throw new Error(`第 ${line} 行：${label} 不是有限数值`);
  return number;
}

function parseCases(text) {
  const rows = readCSV(text);
  if (!rows.length) throw new Error('CSV 缺少表头');
  if (rows.length > 10001) throw new Error('单个文件最多导入 10000 个案例，请分成多个文件');

  const [headerRow, ...body] = rows;
  const columns = headerRow.cells.map(cell => cell.trim().toLowerCase());
  const modern = columns.includes('case_id') || columns.includes('q_0_um');
  const header = modern ? columns : columns.map(column => LEGACY_ALIASES.get(column) ?? column);
  const idColumn = modern ? 'case_id' : 'id';
  const motorColumns = modern ? MOTOR_COLUMNS : LEGACY_MOTOR_COLUMNS;
  const fields = modern ? [idColumn, 'branch'] : [idColumn];
  if (new Set(header).size !== header.length) throw new Error('表头有重复列');
  const missing = [...fields, ...CENTER_COLUMNS, ...motorColumns].filter(column => !header.includes(column));
  if (missing.length) throw new Error('缺少列 ' + missing.join(', '));

  const ids = new Set();
  return body.map(({cells, line}) => {
    if (cells.length !== header.length) {
      throw new Error(`第 ${line} 行应有 ${header.length} 列，实际有 ${cells.length} 列`);
    }
    const record = Object.fromEntries(header.map((column, i) => [column, cells[i].trim()]));
    const id = record[idColumn];
    if (!id) throw new Error(`第 ${line} 行缺少案例编号`);
    if (ids.has(id)) throw new Error(`第 ${line} 行案例编号 ${id} 重复`);
    ids.add(id);

    const q = motorColumns.map((column, i) => {
      const value = numeric(record[column], column, line);
      const [low, high] = LIMITS[i];
      if (value < low - MOTOR_TOLERANCE || value > high + MOTOR_TOLERANCE) {
        throw new Error(`第 ${line} 行初态 ${column} = ${value} 超出范围 ${low}～${high} μm`);
      }
      return value;
    });
    const center = CENTER_COLUMNS.map(column => numeric(record[column], column, line));
    const algorithm = record.algorithm || (modern ? null : ORDINARY_EXIT);
    const computedBranch = selectBranch(q);
    const branch = modern ? record.branch : null;
    if (modern && !/^[A-E]$/.test(branch)) throw new Error(`第 ${line} 行 branch 须为 A～E`);

    let violation = null;
    if (record.violation_u) {
      const u = numeric(record.violation_u, 'violation_u', line, '0～1 的归一化进度');
      if (u < 0 || u > 1) throw new Error(`第 ${line} 行 violation_u 须在 0～1 之间`);
      violation = {u};
    }
    const types = record.violation_reason || record.categories || record['分类'] || record['类别'] || '';
    const violationTypes = [...new Set(types.split(/[、；;|\n]/)
      .map(type => type.trim().replace(/\s*[（(]回放[）)]$/, '')).filter(Boolean))];
    return {id, algorithm, branch, computedBranch, q, center, violation, violationTypes};
  });
}
