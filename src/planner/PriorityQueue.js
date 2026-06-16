export class PriorityQueue {
  constructor() {
    this._heap = [];
  }

  get size() {
    return this._heap.length;
  }

  push(item, priority) {
    this._heap.push({ item, priority });
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

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._heap[parent].priority <= this._heap[i].priority) break;
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
      if (l < n && this._heap[l].priority < this._heap[min].priority) min = l;
      if (r < n && this._heap[r].priority < this._heap[min].priority) min = r;
      if (min === i) break;
      [this._heap[min], this._heap[i]] = [this._heap[i], this._heap[min]];
      i = min;
    }
  }
}
