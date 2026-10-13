import sqlite3

path = 'database/seeds/PB_bairros_CD2022.gpkg'
connection = sqlite3.connect(path)
connection.text_factory = bytes
table = 'PB_bairros_CD2022'
print(connection.execute(f'PRAGMA table_info({table})').fetchall())
print('rows=', connection.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0])
print('municipalities=', connection.execute(f'SELECT COUNT(DISTINCT CD_MUN) FROM {table}').fetchone()[0])
rows = connection.execute(f'SELECT DISTINCT CD_MUN, NM_MUN FROM {table} ORDER BY NM_MUN').fetchall()
print('municipality_names=', [(code.decode('ascii'), name.decode('latin1')) for code, name in rows])
print('distinct_neighborhoods=', connection.execute(f'SELECT COUNT(DISTINCT CD_MUN || \'|\' || NM_BAIRRO) FROM {table}').fetchone()[0])
raw = connection.execute(f'SELECT NM_BAIRRO FROM {table} WHERE NM_BAIRRO IS NOT NULL LIMIT 10').fetchall()
print('encoding_sample=', [(value.decode('utf8', 'replace'), value.decode('latin1')) for (value,) in raw])
print('raw_sample=', [(value,) for (value,) in raw if b'Bras' in value][:1])
