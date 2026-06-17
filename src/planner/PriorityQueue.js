// A stable min-heap: items with equal priority pop in insertion order (FIFO).
// Stability matters because the planners push every search node at priority 0
// when no cost function is given — without a FIFO tiebreaker the search would
// no longer be breadth-first and would stop returning the shortest plan.
export class PriorityQueue {
  constructor() {
    this._heap = [];
    this._seq  = 0;  // monotonic insertion counter, used to break priority ties
  }

  get size() {
    return this._heap.length;
  }

  push(item, priority) {
    this._heap.push({ item, priority, seq: this._seq++ });
    this._bubbleUp(this._heap.length - 1);
  }

  pop() {
    const top  = this._heap[0];
    const last = this._heap.pop();
    if (this._heap.length > 0) {
      this._heap[0] = last;
      this._siftDown(0);
    }
    return top.item;
  }

  // a is "less than" b if it has lower priority, or equal priority but was
  // inserted earlier. The seq tiebreaker is what makes the heap stable.
  _lessThan(a, b) {
    if (a.priority !== b.priority) return a.priority < b.priority;
    return a.seq < b.seq;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this._lessThan(this._heap[i], this._heap[parent])) break;
      [this._heap[parent], this._heap[i]] = [this._heap[i], this._heap[parent]];
      i = parent;
    }
  }

  _siftDown(i) {
    const n = this._heap.length;
    while (true) {
      let min = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this._lessThan(this._heap[l], this._heap[min])) min = l;
      if (r < n && this._lessThan(this._heap[r], this._heap[min])) min = r;
      if (min === i) break;
      [this._heap[min], this._heap[i]] = [this._heap[i], this._heap[min]];
      i = min;
    }
  }
}
