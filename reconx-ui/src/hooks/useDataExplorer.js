import { useState, useEffect } from 'react';

export function useTables() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/tables')
      .then((res) => res.json())
      .then((data) => {
        setTables(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { tables, loading };
}

export function useTableSchema(tableName) {
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tableName) { setSchema(null); return; }
    setLoading(true);
    fetch(`/api/tables/${tableName}/schema`)
      .then((res) => res.json())
      .then((data) => {
        setSchema(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tableName]);

  return { schema, loading };
}

export function useTableSample(tableName, limit = 10) {
  const [sample, setSample] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tableName) { setSample(null); return; }
    setLoading(true);
    fetch(`/api/tables/${tableName}/sample?limit=${limit}`)
      .then((res) => res.json())
      .then((data) => {
        setSample(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tableName, limit]);

  return { sample, loading };
}
