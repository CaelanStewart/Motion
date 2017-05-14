class Draggable {
    constructor(container, selector, settings) {
        this.selector = selector;
        this.container = container;

        document.addEventListener('mousemove', event => this._onMouseMove(event));
        document.addEventListener('mouseup', event => this._onMouseUp(event));

        this.currentObject = null;

        this.decelerationStack = [ ];
        this.animationLoopRunning = false;

        this._progressAnimations_bound = null;

        this.settings = {
			initialColour: '#222222',
			randomiseInitialVelocity: false,
			randomiseColour: false,
			randomiseOpacity: false,
            edgeFriction: 0.75,
            friction: 1,
            bounceFriction: 0.5
        };
		
		if(typeof settings === 'object') {
			Object.assign(this.settings, settings);
		}

        this._initObjects();
    }

    _initObjects() {
        this.objects = this.container.querySelectorAll(this.selector);

        Array.prototype.forEach.call(this.objects, object => {
            if(object.classList.contains('draggable-init'))
                return;

            object.addEventListener('mousedown', event => this._onMouseDown(event));
			
			if(this.settings.initialColour) {
				object.style.backgroundColor = this.settings.initialColour;
			}
			
			if(this.settings.randomiseOpacity) {
				object.style.opacity = Math.random();
			}
			
			if(this.settings.randomiseColour) {
				object.style.backgroundColor = 'rgba(' +
					~~(Math.random() * 256) + ',' +
					~~(Math.random() * 256) + ',' +
					~~(Math.random() * 256) +
				')';
			}
			
			if(this.settings.randomiseInitialVelocity) {
				let objectRect = object.getBoundingClientRect();
				
				this._onMouseDown({
					clientX: objectRect.left + ((objectRect.right - objectRect.left) / 2),
					clientY: objectRect.top + ((objectRect.bottom - objectRect.top) / 2),
					currentTarget: object
				});
				
				object.__draggable_cache.velocity = {
					X: Math.random(),
					Y: Math.random()
				};
				
				this._animateDeceleration(object);
				
				this.currentObject = null;
			}
        });
    }

    _onMouseDown(event) {
        let object = event.currentTarget;

        Draggable._cacheProperties(object);
        Draggable._cacheProperties(this.container);

        let cursorPosRelativeToContainer = Draggable._getCursorPositionRelativeTo(event, this.container),
            cursorPosRelativeToObject = Draggable._getCursorPositionRelativeTo(event, object),
			matrixString = window.getComputedStyle(object).transform,
			matrix = Draggable._parseMatrix(matrixString);
			
		['X', 'Y'].forEach((axis, index) => matrix[4 + index] = cursorPosRelativeToContainer[axis] - cursorPosRelativeToObject[axis]);
        
        Object.assign(object.__draggable_cache, {
            initialCursorPosRelativeToObject: cursorPosRelativeToObject,
            objectBounds: Draggable._getBoundsRelativeTo(object, this.container),
            time: Date.now(),
            velocity: {
                X: 0,
                Y: 0
            },
			matrix
        });

        let stackIndex = this.decelerationStack.indexOf(object);

        if(stackIndex !== -1) {
            this.decelerationStack.splice(stackIndex, 1);

            --this.stackLength;
        }

        object.__draggable_mouseIsDown = true;

        this.currentObject = object;
    }

    _onMouseMove(event) {
        if(!this.currentObject)
            return;

        let object = this.currentObject;

        if(object.__draggable_mouseIsDown) {
            let cache = object.__draggable_cache,
                cursorPosRelativeToContainer = Draggable._getCursorPositionRelativeTo(event, this.container),
                cursorPosRelativeToObject = cache.initialCursorPosRelativeToObject,
                objectBounds = cache.objectBounds,
                time = Date.now(),
				matrix = cache.matrix.slice(0);

            // Iterate through axis and apply bounds and edge friction
            ['X', 'Y'].forEach((axis, index) => {
				matrix[4 + index] = cursorPosRelativeToContainer[axis] - cursorPosRelativeToObject[axis];
				
                ['min', 'max'].forEach(bound => {
                    if(Math[bound](matrix[4 + index], objectBounds[bound + axis]) === matrix[4 + index])
                        matrix[4 + index] = objectBounds[bound + axis] + ((matrix[4 + index] - objectBounds[bound + axis]) * (1 - this.settings.edgeFriction));
                });
            });

            let deltaTime = time - cache.time;

            ['X', 'Y'].forEach((axis, index) => cache.velocity[axis] = (matrix[4 + index] - cache.matrix[4 + index]) / deltaTime);
			
            cache.matrix = matrix;
            cache.time = time;

            Draggable._setObjectMatrix(object, cache.matrix);
        }
    }

    _onMouseUp() {
        if(!this.currentObject) {
            return;
        }

        let object = this.currentObject,
            cache = object.__draggable_cache,
            time = Date.now(),
            deltaTime = time - cache.time,
            objectBounds = cache.objectBounds,
            matrix = cache.matrix;

        if(deltaTime > 50) {
            cache.velocity.X = cache.velocity.Y = 0;
        }

        ['X', 'Y'].forEach((axis, index) => {
            ['min', 'max'].forEach(bound => {
                if(Math[bound](matrix[4 + index], objectBounds[bound + axis]) === matrix[4 + index])
                    cache.velocity[axis] = -((matrix[4 + index] - objectBounds[bound + axis]) / 100);
            });
        });

        this._animateDeceleration(this.currentObject);

        this.currentObject = null;
    }

    _animateDeceleration(object) {
        let cache = object.__draggable_cache;

        if(Math.abs(cache.velocity.X) > 0 || Math.abs(cache.velocity.Y) > 0) {
            this.stackLength = this.decelerationStack.push(object);
        }

        cache.time = Date.now();

        if(!this.animationLoopRunning && this.stackLength) {
            this.animationLoopRunning = true;

            window.requestAnimationFrame(
                this._progressAnimations.bind(this)
            );
        }
    }

    _progressAnimations() {
        if(!this._progressAnimations_bound) {
            this._progressAnimations_bound = this._progressAnimations.bind(this);
        }

        let stack = this.decelerationStack,
            toRemoveFromStack = [ ];

        stack.forEach((object, index) => {
            let cache = object.__draggable_cache,
                time = Date.now(),
                deltaTime = time - cache.time,
                objectBounds = cache.objectBounds,
                velocity = { },
				matrix = cache.matrix.slice(0);

            ['X', 'Y'].forEach((axis, axisIndex) => {
                velocity[axis] = cache.velocity[axis] * (1 - (deltaTime / 1000 * this.settings.friction));
				
				if(velocity[axis]) {
                    matrix[4 + axisIndex] = cache.matrix[4 + axisIndex] + (velocity[axis] * deltaTime);
                }

                ['min', 'max'].forEach(bound => {
                    if(Math[bound](matrix[4 + axisIndex], objectBounds[bound + axis]) === matrix[4 + axisIndex] && Math.sign(velocity[axis]) === Math[bound](1, -1)) {
                        velocity[axis] = -(velocity[axis] * (1 - this.settings.bounceFriction));
						matrix[4 + axisIndex] = objectBounds[bound + axis];
					}
                });
            });

            Draggable._setObjectMatrix(object, matrix);

            if(Math.abs(velocity.X) < 0.001 && Math.abs(velocity.Y) < 0.001) {
                toRemoveFromStack.push(index);
            }

            cache.time = time;
            cache.matrix = matrix;
            cache.velocity = velocity;
        });

        toRemoveFromStack.forEach(index => this.decelerationStack.splice(index, 1));

        this.stackLength -= toRemoveFromStack.length;

        // If there are no more items in the stack, stop animating
        if(this.stackLength <= 0) {
            this.stackLength = 0;
            this.animationLoopRunning = false;
        }

        if(this.animationLoopRunning) {
            window.requestAnimationFrame(this._progressAnimations_bound);
        }
    }

    static _getBoundsRelativeTo(object, to) {
        let objectCache = object.__draggable_cache,
            toCache = to.__draggable_cache,
            objectRect = objectCache.rect,
            toRect = toCache.rect;

        return {
            minX: 0,
            minY: 0,
            maxX: (toRect.right - toRect.left) - (objectRect.right - objectRect.left),
            maxY: (toRect.bottom - toRect.top) - (objectRect.bottom - objectRect.top)
        };
    }

    static _getPositionRelativeTo(object, to) {
        let objectCache = object.__draggable_cache,
            toCache = to.__draggable_cache;

        return {
            X: objectCache.rect.left - toCache.rect.left,
            Y: objectCache.rect.top - toCache.rect.top
        };
    }

    static _getCursorPositionRelativeTo(event, to) {
        let properties = to.__draggable_cache;

        return {
            X: event.clientX - properties.rect.left,
            Y: event.clientY - properties.rect.top
        }
    }

    static _cacheProperties(object) {
        if(typeof object.__draggable_cache !== 'object') {
            object.__draggable_cache = { };
        }

        object.__draggable_cache.rect = object.getBoundingClientRect();
    }

    static _setObjectMatrix(object, matrix) {
        object.style.transform = 'matrix(' + matrix.join(', ') + ')';
    }
	
	static _parseMatrix(computedTransform) {
		let matrixIndex = computedTransform.indexOf('matrix'),
			leftBracketIndex = computedTransform.indexOf('(', matrixIndex),
			rightBracketIndex = computedTransform.indexOf(')', leftBracketIndex),
			matrixSequence = computedTransform.substring(leftBracketIndex + 1, rightBracketIndex),
			matrixSplit = matrixSequence.split(',').map(element => parseFloat(element));
		
		if(matrixIndex === -1 || matrixSplit.length !== 6) {
			return [1, 0, 0, 1, 0, 0];
		}
		
		return matrixSplit;
	}
}
